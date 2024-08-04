import OpenAI from "openai";
import dotenv from 'dotenv'
import { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources";


dotenv.config()
const client = new OpenAI({
  apiKey: process.env.API_KEY || "",
  baseURL: process.env.API_URL || "https://api.openai.com/v1"
})
const model = process.env.DEFAULT_MODEL || 'gpt-4o-mini'

const tools: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'get_feishu_docx_or_sheets',
      // 避免GPT胡言乱语。但他还是会胡言乱语。
      description: '获取飞书云文档、电子表格的内容，域名为*.feishu.cn，路径需包含"/docx/"或"/sheets/"，仅接受一个飞书云文档或电子表格链接，超出一个链接则提示用户。 \
      如果上下文发现两个同样的飞书链接，请直接回复用户，不要调用此函数。如果确定接收到飞书云文档或电子表格链接，不必征询客户授权。\
      这个函数并不是一个访问互联网的能力。',
      parameters: {
        type: 'object',
        properties: {
          url: {
            type: "string",
            description: "飞书云文档/电子表格链接"
          }
        },
        required: ['url']
      }
    }
  },
]


/*
暂时做不了
 

  {
    type: 'function',
    function: {
      name: 'get_mermaid_string',
      // 避免GPT胡言乱语。
      description: '根据用户的提示信息，如果指定了使用mermaid生图，则调用此函数。',
      parameters: {
        type: 'object',
        properties: {
          mermaid_text: {
            type: "string",
            descrtion: "mermaid纯文本内容。"
          }
        },
        required: ['mermaid_text']
      }
    }
  }
*/




export async function requestCompletion(msgs: ChatCompletionMessageParam[],defined_tool?:ChatCompletionTool[]) {
  try {
    const completion = await client.chat.completions.create({
      model: model,
      messages: msgs,
      stream: false,
      temperature: 0.3,
      max_tokens: parseInt(process.env.MAX_TOKEN || '2048'),
      tools:defined_tool?defined_tool:tools
    });
    return completion
  } catch (e) {
    console.log(e)
    return
  }
}

export async function requestStreamCompletion(msgs: ChatCompletionMessageParam[],defined_tool?:ChatCompletionTool[]) {
  try {
    const completion = client.chat.completions.create({
      model: model,
      messages: msgs,
      stream: true,
      temperature: 0.3,
      max_tokens: parseInt(process.env.MAX_TOKEN || '2048'),
      tools:defined_tool?defined_tool:tools
    });
    return completion
  } catch (e) {
    console.log(e)
    return
  }
}