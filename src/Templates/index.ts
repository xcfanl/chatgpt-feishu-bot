import { ChatCompletionContentPart, ChatCompletionMessageParam } from 'openai/resources'
import { downloadFile } from '../feishu'
import { findMongoMsg } from '../mongo'
import dotenv from 'dotenv'
import fs from 'node:fs'

dotenv.config()

export const defaultPrompt: ChatCompletionMessageParam = {
  role: "system",
  content: process.env.DEFAULT_PROMT || "你是ChatGpt，由OPENAI 提供的人工智能助手。你会为用户提供安全，有帮助，准确的回答。同时，你会拒绝一切涉及恐怖主义，种族歧视，黄色暴力等问题的回答。"
}

export const accessEventMSG = {
  "config": {},
  "i18n_elements": {
    "zh_cn": [
      {
        "tag": "hr"
      },
      {
        "tag": "markdown",
        "content": "**已开发功能说明(未经充分测试)**\
        \n- 流式、非流式文本生成。\
        \n- 支持格式为docx/doc/txt/md/mark/markdown/xlsx/xls/csv的文件直接拖入。\
        \n- 支持图片直接拖入（分析内容），或粘贴后增加自定义提问内容。\
        \n- 支持飞书文档云文档、电子表格（非多维表格）的识别和内容提取。（不支持多个链接）\
        \n ",
        "text_align": "left",
        "text_size": "normal",
        "icon": {
          "tag": "standard_icon",
          "token": "apaas_colorful",
          "color": "grey"
        }
      }
    ]
  },
  "i18n_header": {
    "zh_cn": {
      "title": {
        "tag": "plain_text",
        "content": "Chatgpt-Bot"
      },
      "subtitle": {
        "tag": "plain_text",
        "content": ""
      },
      "template": "default",
      "ud_icon": {
        "tag": "standard_icon",
        "token": "chat-news_outlined"
      }
    }
  }
}

export function buildReplyMsg(msg: string | null, statusIcon?: string, statusText?: string) {
  return {
    "config": {},
    "i18n_elements": {
      "zh_cn": [
        {
          "tag": "markdown",
          "content": msg ? msg : "聊天失败，请联系管理员。",
          "text_align": "left",
          "text_size": "normal"
        },
      ]
    },
    "i18n_header": {
      "zh_cn": {
        "title": {
          "tag": "plain_text",
          "content": "Chatgpt-Bot"
        },
        "subtitle": {
          "tag": "plain_text",
          "content": statusText ? statusText : ""
        },
        "template": "wathet",
        "ud_icon": {
          "tag": "standard_icon",
          "token": statusIcon ? statusIcon : "robot_outlined"
        }
      }
    }
  }
}

export async function buildCompletionMsg(root_id: string, message_id: string, content: string | ChatCompletionContentPart[]) {
  let MSG: ChatCompletionMessageParam[] = []
  const historyChat = await findMongoMsg(root_id)
  if (historyChat && historyChat.length > 0) {
    for (const msg of historyChat) {
      if (msg.content && (msg.sender === 'user' || msg.sender === 'system')) {
        MSG.push({
          role: msg.sender === 'user' ? msg.sender : 'system',
          content: msg.content
        })
      } else if (msg.content && msg.sender === 'assistant') {
        MSG.push({
          role: 'assistant',
          content: msg.content
        })
      } else if (msg.tool_calls && msg.sender === 'assistant') {
        //从mongo提取出来的数据，mongo的格式定义中，不能指定type为function,所以重新构建。
        MSG.push({
          role: 'assistant',
          tool_calls: [{
            function: msg.tool_calls[0].function,
            id: msg.tool_calls[0].id,
            type: 'function'
          }]
        })
      } else if (msg.tool_call_id && msg.content) {
        MSG.push({
          role: 'tool',
          content: msg.content,
          tool_call_id: msg.tool_call_id
        })
      }
    }
  }
  MSG.push({
    role: 'user',
    content
  })
  MSG.unshift(
    defaultPrompt
  )
  return MSG
}

export async function rebuildReceivedContent(content: string, message_id: string) {
  const jsonContent = JSON.parse(content)
  let textContent: string = ""
  const partContent: ChatCompletionContentPart[] = []
  const image_keys: string[] = []
  if (jsonContent.text) {
    textContent = jsonContent.text
  } else if (jsonContent.content) {
    for (const items of jsonContent.content) {
      for (const item of items) {
        if (item.tag === 'img') {
          image_keys.push(item.image_key)
        } else if (item.tag === "text") {
          textContent += item.text
        }
      }
    }
  } else if (jsonContent.image_key) {
    image_keys.push(jsonContent.image_key)
  }
  if (image_keys.length > 0) {
    partContent.push({
      type: 'text',
      text: textContent === "" ? "请分析这张图片的内容。" : textContent
    })
    for (const image_key of image_keys) {
      try {
        const checkDownload = await downloadFile(image_key, message_id, 'image').then(async image => {
          if (!image) { return false }
          await image.writeFile(`data/${image_key}`)
          return true
        })
        if (!checkDownload) {
          return
        }
        const base64Img = fs.readFileSync(`data/${image_key}`).toString('base64')
        partContent.push({
          type: 'image_url',
          image_url: {
            url: `data:image/jpeg;base64,${base64Img}`
          }
        })
      } catch (e) {
        console.log(e)
      }
    }
  }
  if (partContent.length > 1) {
    return partContent
  } else {
    return textContent
  }
}

export function buildSheetCard(
  sheets: {
    sheet_id: string,
    title: string,
    row_count: number,
    column_count: number
  }[],
  domain: string,
  token: string,
  root_id: string,
  tool_call_id: string) {
  const selectList = sheets.map(sheet => {
    return {
      text: {
        tag: "plain_text",
        content: sheet.title
      },
      value: `{"sheet_id":"${sheet.sheet_id}","row_count": ${sheet.row_count},"column_count":${sheet.column_count},"token":"${token}","domain": "${domain}","root_id":"${root_id}","tool_call_id":"${tool_call_id}"}`,
      icon: {
        tag: "standard_icon",
        token: "bitablegrid_outlined"
      }
    }
  })
  return {
    "config": {},
    "i18n_elements": {
      "zh_cn": [
        {
          "tag": "markdown",
          "content": `文件已导入**[云文档](${domain.startsWith('http') ? domain : `https://${domain}/sheet/${token}`})**。\n文件包含多个子表，表格内容不宜过大，选择其中的一个提交：${sheets.map(sheet => {
            return `\n- **${sheet.title}：**包含${sheet.row_count}行，${sheet.column_count}列数据。`
          })}`,
          "text_align": "left",
          "text_size": "normal"
        },
        {
          "tag": "form",
          "elements": [
            {
              "tag": "select_static",
              "placeholder": {
                "tag": "plain_text",
                "content": "请选择其中一个字表"
              },
              "options": selectList,
              "type": "default",
              "width": "fill",
              "initial_index": 1,
              "name": "sheetSlected"
            },
            {
              "tag": "column_set",
              "flex_mode": "none",
              "background_style": "default",
              "horizontal_spacing": "default",
              "columns": [
                {
                  "tag": "column",
                  "width": "auto",
                  "vertical_align": "top",
                  "elements": [
                    {
                      "tag": "button",
                      "text": {
                        "tag": "plain_text",
                        "content": "提交"
                      },
                      "type": "primary_filled",
                      "complex_interaction": true,
                      "width": "fill",
                      "action_type": "form_submit",
                      "name": 'submit',
                    }
                  ]
                },
                {
                  "tag": "column",
                  "width": "auto",
                  "vertical_align": "top",
                  "elements": [
                    {
                      "tag": "button",
                      "text": {
                        "tag": "plain_text",
                        "content": "取消"
                      },
                      "type": "danger",
                      "complex_interaction": true,
                      "width": "fill",
                      "action_type": "form_reset",
                      "name": "cancel"
                    }
                  ]
                }
              ],
              "margin": "0px 0px 0px 0px"
            }
          ],
          "name": "Form_lyv0qodx",
          "fallback": {
            "tag": "fallback_text",
            "text": {
              "tag": "plain_text",
              "content": "仅支持在 V6.6 及以上版本使用"
            }
          }
        }
      ]
    },
    "i18n_header": {
      "zh_cn": {
        "title": {
          "tag": "plain_text",
          "content": "ChatGPT-Bot"
        },
        "subtitle": {
          "tag": "plain_text",
          "content": "文件导入完成。"
        },
        "template": "blue"
      }
    }
  }
}
