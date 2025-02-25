import { ChatChain } from 'koishi-plugin-chatluna/chains'
import { Context } from 'koishi'
import { Config, logger } from '..'
import { ChatLunaPlugin } from 'koishi-plugin-chatluna/services/chat'
import type {} from 'koishi-plugin-chatluna/llm-core/memory/message'
import { Chain } from '../llm-core/chains/type'
import { DocumentConfig } from '../types'
import { VectorStore } from '@langchain/core/vectorstores'
import { MultiScoreThresholdRetriever } from '../llm-core/retrievers/multi_score_threshold'
import { parseRawModelName } from 'koishi-plugin-chatluna/llm-core/utils/count_tokens'
import { ChatLunaChatModel } from 'koishi-plugin-chatluna/llm-core/platform/model'
import { ChatInterface } from 'koishi-plugin-chatluna/llm-core/chat/app'
import {
    ChatLunaError,
    ChatLunaErrorCode
} from 'koishi-plugin-chatluna/utils/error'

export async function apply(
    ctx: Context,
    config: Config,
    plugin: ChatLunaPlugin,
    chain: ChatChain
): Promise<void> {
    const cache: Map<string, ReturnType<Chain>> = new Map()

    ctx.on(
        'chatluna/before-chat',
        async (
            conversationId,
            message,
            promptVariables,
            chatInterface,
            chain
        ) => {
            if (chatInterface.chatMode === 'plugin') {
                return undefined
            }

            let searchChain: ReturnType<Chain> = cache.get(conversationId)

            if (!searchChain) {
                searchChain = await createSearchChain(
                    ctx,
                    config,
                    chatInterface
                )

                if (!searchChain) {
                    return
                }

                cache.set(conversationId, searchChain)
            }

            const documents = await searchChain(
                message.content as string,
                await chatInterface.chatHistory.getMessages()
            )

            logger.debug(
                `Documents: ${documents.map((doc) => doc.pageContent).join('\n\n')}`
            )

            promptVariables['knowledge'] = documents
        }
    )

    ctx.on('chatluna/clear-chat-history', async () => {
        cache.clear()
        ctx.chatluna_knowledge.clearVectorStore()
    })
}

async function createSearchChain(
    ctx: Context,
    config: Config,
    chatInterface: ChatInterface
): Promise<ReturnType<Chain>> {
    const preset = await chatInterface.preset
    const searchKnowledge = preset.knowledge?.knowledge
    const chatVectorStore = ctx.chatluna.config.defaultVectorStore
    const selectedKnowledge: DocumentConfig[] = []

    if (searchKnowledge) {
        const regex =
            typeof searchKnowledge === 'string'
                ? searchKnowledge
                : searchKnowledge.join('|')

        const knowledge = await ctx.database.get('chathub_knowledge', {
            name: {
                $regex: new RegExp(regex)
            },
            vector_storage: chatVectorStore
        })

        selectedKnowledge.push(...knowledge)
    } else {
        const knowledge = await ctx.database.get('chathub_knowledge', {
            name: config.defaultKnowledge
        })

        selectedKnowledge.push(...knowledge)
    }

    if (selectedKnowledge.length === 0) {
        logger.warn('No knowledge selected')
        return
    } else {
        logger.debug(`Selected knowledge: ${JSON.stringify(selectedKnowledge)}`)
    }

    const vectorStores = await Promise.all(
        selectedKnowledge.map((knowledge) =>
            ctx.chatluna_knowledge.loadVectorStore(knowledge.path)
        )
    )

    const retriever = createRetriever(config, vectorStores)

    if (!config.model) {
        throw new ChatLunaError(
            ChatLunaErrorCode.KNOWLEDGE_CONFIG_INVALID,
            new Error('model is not set')
        )
    }

    const [platform, modelName] = parseRawModelName(config?.model)

    const model = await ctx.chatluna
        .createChatModel(platform, modelName)
        .then((model) => model as ChatLunaChatModel)

    return ctx.chatluna_knowledge.chains[config.mode](model, retriever)
}

function createRetriever(config: Config, vectorStores: VectorStore[]) {
    return MultiScoreThresholdRetriever.fromVectorStores(vectorStores, {
        minSimilarityScore: config.minSimilarityScore,
        maxK: config.topK
    })
}
