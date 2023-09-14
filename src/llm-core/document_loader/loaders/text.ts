import { Document } from 'langchain/dist/document'
import { DocumentLoader } from '../types'
import { TextLoader } from 'langchain/document_loaders/fs/text'
export default class TextDocumentLoader extends DocumentLoader {
    public load(path: string): Promise<Document[]> {
        const loader = new TextLoader(path)

        return loader.load()
    }

    public async support(path: string): Promise<boolean> {
        const ext = path.split('.').pop() || ''

        switch (ext.toLowerCase()) {
            case 'text':
            case 'txt':
                return true
            default:
                return false
        }
    }
}
