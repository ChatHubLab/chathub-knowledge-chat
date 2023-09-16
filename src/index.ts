import { Context, Schema } from 'koishi'

import { ChatHubPlugin } from '@dingyi222666/koishi-plugin-chathub/lib/services/chat'
import { plugins } from './plugin'
import { KnowledgeConfigService, KnowledgeService } from './service/knowledge'

export let knowledgeConfigService: KnowledgeConfigService
export let knowledgeService: KnowledgeService

export function apply(ctx: Context, config: Config) {
    const plugin = new ChatHubPlugin(ctx, config, 'knowledge-chat')

    ctx.on('ready', async () => {
        knowledgeConfigService = new KnowledgeConfigService(ctx)
        knowledgeService = new KnowledgeService(ctx, config, knowledgeConfigService)

        await plugin.registerToService()

        await knowledgeConfigService.loadAllConfig()
        await knowledgeService.loader.init()

        await plugins(ctx, plugin, config)
    })

    ctx.on('dispose', async () => {
        knowledgeConfigService = null
    })
}

export const name = '@dingyi222666/chathub-knowledge-chat'

export interface Config extends ChatHubPlugin.Config {
    defaultConfig: string
    chunkSize: number
    chunkOverlap: number
    minSimilarityScore: number
    mode: 'default' | 'regenerate' | 'contextual-compression'
}

export const Config = Schema.intersect([
    Schema.object({
        defaultConfig: Schema.dynamic('knowledge-config')
            .default('default')
            .description('默认的知识库配置文件'),
        chunkSize: Schema.number()
            .default(500)
            .max(2000)
            .min(10)
            .description('文本块的切割大小（字符）'),
        chunkOverlap: Schema.number()
            .default(0)
            .max(200)
            .min(0)
            .description('文本块之间的最大重叠量（字体）。保留一些重叠可以保持文本块之间的连续性'),
        mode: Schema.union([
            Schema.const('default').description('直接对问题查询'),
            Schema.const('regenerate').description('重新生成问题查询'),
            Schema.const('contextual-compression').description('上下文压缩查询')
        ])
            .default('default')
            .description('知识库运行模式'),
        minSimilarityScore: Schema.number()
            .role('slider')
            .min(0)
            .max(1)
            .step(0.001)
            .default(0.5)
            .description('文本搜索的最小相似度')
    }).description('基础配置')
])

export const using = ['chathub']
