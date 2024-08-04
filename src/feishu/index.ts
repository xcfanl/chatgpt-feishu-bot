import dotenv from 'dotenv'
import * as lark from '@larksuiteoapi/node-sdk'
import { AESCipher } from '@larksuiteoapi/node-sdk'
import { accessEventMSG, buildCompletionMsg, buildReplyMsg, rebuildReceivedContent, buildSheetCard } from '../Templates'
import { requestCompletion, requestStreamCompletion } from '../openai';
import { createMongoMsg } from '../mongo';
import fs from 'node:fs'
import { ChatCompletionTool } from 'openai/resources';

dotenv.config()
const ek = process.env.FEISHU_EK || ""
const app_id = process.env.FEISHU_APP_ID || ""
const app_secret = process.env.FEISHU_APP_SECRET || ""
const client = new lark.Client({
  appId: app_id,
  appSecret: app_secret,
  disableTokenCache: false,
  domain: 'https://open.feishu.cn'
})
const stream = process.env.STREAM === '0' ? false : true
const interval = parseInt(process.env.FEISHU_CARD_INTERVAL || '500')
const check_interval = parseInt(process.env.FEISHU_CHECK_INTERVAL || '5000')

/*
class AESCipher {
  key: Buffer;
  constructor(key: string) {
    const hash = crypto.createHash('sha256');
    hash.update(key);
    this.key = hash.digest();
  }
  decrypt(encrypt: string) {
    const encryptBuffer = Buffer.from(encrypt, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-cbc', this.key, encryptBuffer.slice(0, 16));
    let decrypted = decipher.update(encryptBuffer.slice(16).toString('hex'), 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }
}
  */

async function getOrgDomain() {
  try {
    const org_domain = await client.tenant.tenant.query()
    return org_domain.data?.tenant?.domain ? org_domain.data.tenant.domain : ""
  } catch (e) {
    console.log(e)
    return ""
  }
}

async function replyCard(content: string, message_id: string) {
  try {
    return await client.im.message.reply({
      data: {
        msg_type: 'interactive',
        content: content,
        reply_in_thread: false,
      },
      path: {
        message_id: message_id
      },
    })
  } catch (e) {
    console.log(e)
    return
  }
}

export async function patchCard(content: string, message_id: string) {
  try {
    client.im.message.patch({
      data: {
        content
      },
      path: {
        message_id
      }
    })
  } catch (e) {
    console.log(e)
    return
  }
}

async function createUpload(file_name: string, file: Buffer, importType: string, file_type: string, size: number) {
  try {
    const res = await client.drive.media.uploadAll({
      data: {
        file_name,
        parent_type: "ccm_import_open",
        parent_node: "",
        file,
        extra: JSON.stringify({ obj_type: importType, file_extension: file_type }),
        size
      }
    })
    return res
  } catch (e) {
    console.log(e)
    return
  }
}

async function createImportTask(file_name: string, file_token: string, type: string, file_extension: string) {
  try {
    const res = await client.drive.importTask.create({
      data: {
        file_name,
        file_token,
        type,
        file_extension,
        point: {
          mount_type: 1,
          mount_key: ''
        }
      }
    })
    return res
  } catch (e) {
    console.log(e)
    return
  }

}

async function checkImportTask(ticket: string) {
  try {
    const res = await client.drive.importTask.get({
      path: {
        ticket
      }
    })
    return res
  } catch (e) {
    console.log(e)
    return
  }
}

async function getDocRaw(document_id: string) {
  try {
    const res = await client.docx.document.rawContent({
      path: {
        document_id
      }
    })
    return res
  } catch (e) {
    console.log(e)
    return
  }
}

async function getSpreadSheets(spreadsheet_token: string) {
  try {
    const res = await client.sheets.spreadsheetSheet.query({
      path: {
        spreadsheet_token
      }
    })
    return res
  } catch (e) {
    console.log(e)
    return
  }

}

async function creatExportTask(token: string, sub_id: string) {
  try {
    const res = await client.drive.exportTask.create({
      data: {
        file_extension: "csv",
        token,
        type: "sheet",
        sub_id
      }
    })
    return res
  } catch (e) {
    console.log(e)
    return
  }
}

async function checkExportTask(token: string, ticket: string) {
  try {
    const res = await client.drive.exportTask.get({
      params: {
        token,
      },
      path: {
        ticket
      }
    })
    return res
  } catch (e) {
    console.log(e)
    return
  }
}

async function handleSpreadSheet(token: string) {
  const spreadSheets = await getSpreadSheets(token)
  if (!spreadSheets) {
    return
  }
  const sheets = spreadSheets.data?.sheets?.map(sheet => {
    return {
      sheet_id: sheet.sheet_id || "",
      title: sheet.title || "",
      row_count: sheet.grid_properties?.row_count || 0,
      column_count: sheet.grid_properties?.column_count || 0
    }
  })
  if (!sheets) {
    return
  }
  return sheets
}

async function downloadExportTask(file_token: string) {
  try {
    const file = await client.drive.exportTask.download({
      path: {
        file_token
      }
    })
    return file
  } catch (e) {
    console.log(e)
    return
  }
}

async function getFeishuDocxOrSheets(replyContent: string, message_id: string, open_id: string, root_id: string, tool_call_id: string) {
  // 返回列表[boolean,boolean]，第一个为docx是否提取成功，第二个为sheets子表是否提取成功。
  let argument: any
  try {
    argument = JSON.parse(replyContent)
  } catch (e) {
    patchCard(
      JSON.stringify(buildReplyMsg(`获取云文档链接失败，调用参数${replyContent}。\n请注意一次仅接受一个云文档链接。`, "add-chat_outlined", "正在分析文档...")),
      message_id
    )
    // 获取到的参数无效。
    return [false, false]
  }
  const url = argument.url
  if (url && typeof (url) === 'string') {
    patchCard(
      JSON.stringify(buildReplyMsg(`获取到飞书[云文档](${url})。`, "add-chat_outlined", "云文档内容提取成功。")),
      message_id
    )
    const token = url.split('/').pop()?.split('?')[0]
    if (!token) {
      patchCard(
        JSON.stringify(buildReplyMsg(`获取到飞书文档：${url}，提取token信息失败。`, "message-mute_outlined", "聊天失败。")),
        message_id
      )
      return [false, false]
    }
    if (url.includes('/docx/')) {
      const docRaw = await getDocRaw(token)
      if (!docRaw?.data?.content) {
        patchCard(
          JSON.stringify(buildReplyMsg(`获取到飞书文档：${url}，提取文件内容失败。`, "message-mute_outlined", "聊天失败。")),
          message_id
        )
        // 云文档无内容返回。
        return [false, false]
      }
      createMongoMsg({
        open_id,
        root_id,
        message_id,
        sender: "tool",
        create_time: new Date(),
        content: docRaw.data.content,
        tool_call_id
      })
      return [true, false]
    } else if (url.includes('/sheets/')) {
      const sheets = await handleSpreadSheet(token)
      if (sheets) {
        // 将电子表格中的子表信息列入卡片，通过交互再获取表格内容，避免表格过多。
        patchCard(
          JSON.stringify(buildSheetCard(sheets, url, token, root_id, tool_call_id)),
          message_id
        )
        return [false, true]
      } else {
        // 获取不到子表信息。
        patchCard(
          JSON.stringify(buildReplyMsg(`获取子表失败。`, "message-mute_outlined", "聊天失败。")),
          message_id
        )
        return [false, false]
      }

    } else {
      // 不支持的类型
      patchCard(
        JSON.stringify(buildReplyMsg(`不支持该云文档类型：${replyContent}`, "message-mute_outlined", "聊天失败。")),
        message_id
      )
      return [false, false]
    }
  }
  return [false, false]
}

export function decryptEvent(encrypt: string) {
  try {
    const cipher = new AESCipher(ek)
    return (cipher.decrypt(encrypt))
  } catch (e) {
    console.log(e)
    return "{}"
  }
}

export async function replyMessage(open_id: string, _message_id: string, root_id: string, create_time: string, _content: string, called?: boolean, defined_tool?: ChatCompletionTool[]) {
  const content = await rebuildReceivedContent(_content, _message_id)
  const MSG = await buildCompletionMsg(root_id, _message_id, content || "")
  if (!called) {
    createMongoMsg({
      open_id,
      message_id: _message_id,
      root_id,
      sender: "user",
      create_time,
      content,
    })
  } else {
    MSG.pop()
  }
  const res = await replyCard(JSON.stringify(buildReplyMsg("...", "buzz_outlined", "正在思考...")), _message_id)
  if (!res) {
    return
  }
  const message_id = res.data?.message_id || ""

  if (stream) {
    //流式响应过程
    const gptReplyMsg = await requestStreamCompletion(MSG, defined_tool)
    if (!gptReplyMsg) {
      patchCard(
        JSON.stringify(buildReplyMsg(`聊天失败，请重试或联系管理员。`, "message-mute_outlined", "聊天失败。")),
        message_id
      )
      return
    }

    let replyContent = ""
    let start = (new Date()).getTime()
    let function_name = ''
    let tool_call_id = ''
    for await (const chunk of gptReplyMsg) {
      if (chunk.choices[0].delta.tool_calls) {
        replyContent += chunk.choices[0].delta.tool_calls[0].function?.arguments || ""
        if (chunk.choices[0].delta.tool_calls[0].function?.name && chunk.choices[0].delta.tool_calls[0].id) {
          function_name = chunk.choices[0].delta.tool_calls[0].function?.name
          tool_call_id = chunk.choices[0].delta.tool_calls[0].id
        }
        continue
      } else if (chunk.choices[0].finish_reason === 'tool_calls') {
        createMongoMsg({
          open_id,
          root_id,
          message_id: _message_id,
          sender: "assistant",
          create_time: new Date(),
          tool_calls: [{ function: { arguments: replyContent, name: function_name }, id: tool_call_id }],
          prompt_tokens: chunk.usage?.prompt_tokens || 0,
          completion_tokens: chunk.usage?.completion_tokens || 0
        })
        if (function_name === 'get_feishu_docx_or_sheets') {
          const [docx, sheets] = await getFeishuDocxOrSheets(replyContent, message_id, open_id, root_id ? root_id : _message_id, tool_call_id)
          if (docx) {
            replyMessage(open_id, _message_id, root_id, create_time, _content, true)
            return
          }
          // 电子表格则不继续聊天，进入卡片交互。文档则进行下一步聊天。
          if (sheets) { return }
        } 
      }

      replyContent += chunk.choices[0].delta.content || ""
      const now = (new Date()).getTime()
      if (now - start > interval) {
        start = now
        patchCard(
          JSON.stringify(buildReplyMsg(replyContent, "add-chat_outlined", "正在接收信息...")),
          message_id
        )
      }
      if (chunk.usage) {
        createMongoMsg({
          open_id,
          root_id,
          message_id,
          sender: "assistant",
          create_time: new Date(),
          content: replyContent,
          prompt_tokens: chunk.usage.prompt_tokens || 0,
          completion_tokens: chunk.usage.completion_tokens || 0,
        })
      } else if (chunk.choices[0].finish_reason) {
        try {
          // 解决kimi返回的结构和openai不一致问题。
          const _chunk = JSON.parse(JSON.stringify(chunk))
          if (_chunk.choices[0].usage) {
            createMongoMsg({
              open_id,
              root_id,
              message_id,
              sender: "assistant",
              create_time: new Date(),
              content: replyContent,
              prompt_tokens: _chunk.choices[0].usage.prompt_tokens || 0,
              completion_tokens: _chunk.choices[0].usage.completion_tokens || 0
            })
          }
        } catch (e) {
          console.log(e)
        }
      }
    }
    // 循环结束最后更新一次，确保信息完整。等待两秒是为了解决异步更新卡片的延迟，造成消息接收完成的更新之后还在更新。
    setTimeout(() => {
      patchCard(
        JSON.stringify(buildReplyMsg(replyContent, "chat-done_outlined", "消息接收完成。")),
        message_id
      )
    }, interval);
  } else {
    //非流式响应过程
    try {
      const gptReplyMsg = await requestCompletion(MSG, defined_tool)
      if (!gptReplyMsg) {
        patchCard(
          JSON.stringify(buildReplyMsg(`聊天失败，请重试或联系管理员。`, "message-mute_outlined", "聊天失败。")),
          message_id
        )
        return
      }
      if (gptReplyMsg.choices[0].message.tool_calls) {
        const replyContent = gptReplyMsg.choices[0].message.tool_calls[0].function.arguments
        const function_name = gptReplyMsg.choices[0].message.tool_calls[0].function.name
        const tool_call_id = gptReplyMsg.choices[0].message.tool_calls[0].id

        createMongoMsg({
          open_id,
          root_id,
          message_id: _message_id,
          sender: "assistant",
          create_time: new Date(),
          tool_calls: [{ function: { arguments: replyContent, name: function_name }, id: tool_call_id }],
          prompt_tokens: gptReplyMsg.usage?.prompt_tokens || 0,
          completion_tokens: gptReplyMsg.usage?.completion_tokens || 0
        })
        if (function_name === 'get_feishu_docx_or_sheets') {
          const [docx, sheets] = await getFeishuDocxOrSheets(replyContent, message_id, open_id, root_id ? root_id : _message_id, tool_call_id)
          if (docx) {
            replyMessage(open_id, _message_id, root_id, create_time, _content, true)
            return
          }
          // 电子表格则不继续聊天，进入卡片交互。文档则进行下一步聊天。
          if (sheets) { return }
        } 
      }
      patchCard(
        JSON.stringify(buildReplyMsg(gptReplyMsg.choices[0].message.content || "请求ChatGpt失败，请联系管理员。", "chat-done_outlined", "信息接收已经完成。")),
        message_id
      )
      createMongoMsg({
        open_id,
        root_id,
        message_id,
        sender: "assistant",
        create_time: new Date(),
        content: gptReplyMsg.choices[0].message.content,
        prompt_tokens: gptReplyMsg.usage?.prompt_tokens,
        completion_tokens: gptReplyMsg.usage?.completion_tokens
      })
      return

    } catch (e) {
      console.log(e)
      return
    }
  }
}

export function sendMessage(data: any) {
  try {
    client.im.message.create({
      data: {
        receive_id: data.event.operator_id.open_id,
        msg_type: 'interactive',
        content: JSON.stringify(accessEventMSG),
      },
      params: {
        receive_id_type: "open_id"
      }
    }
    ).then(res => {
      console.log(res);
    });
  } catch (e) {
    console.log(e)
  }
}

export async function downloadFile(file_key: string, message_id: string, type: 'image' | 'file') {
  try {
    const file = await client.im.messageResource.get({
      path: {
        message_id,
        file_key
      },
      params: {
        type: type
      }
    })
    return file
  } catch (e) {
    console.log(e)
    return
  }
}

// 文件导入逻辑：识别文件类型，仅支持表格。文档类直接提取内容投递到MONGO历史记录；表格类需用选择一个子表，提取内容投递到MONGO历史记录。
export async function replyFile(_message_id: string, file_key: string, file_name: string, file_type: string) {
  const res = await replyCard(JSON.stringify(buildReplyMsg("接收到文件，请稍等...", "buzz_outlined", "正在导入...")), _message_id)
  if (!res) {
    return
  }
  const message_id = res.data?.message_id || ""
  if (!['doc', 'docx', 'txt', 'md', 'mark', 'markdown', 'html', 'xls', 'xlsx', 'csv'].includes(file_type)) {
    patchCard(
      JSON.stringify(buildReplyMsg("文件格式非word/excel/txt/md/markdown等格式。", "message-mute_outlined", "聊天失败。")),
      message_id
    )
    return
  }
  const checkDownload = await downloadFile(file_key, _message_id, 'file').then(async file => {
    if (!file) { return false }
    await file.writeFile(`data/${file_key}.${file_type}`)
    return true
  })
  if (!checkDownload) {
    patchCard(
      JSON.stringify(buildReplyMsg("文件接收失败，请重试或联系管理员。", "message-mute_outlined", "聊天失败。")),
      message_id
    )
    return
  }
  const file = fs.readFileSync(`data/${file_key}.${file_type}`)
  const size = fs.statSync(`data/${file_key}.${file_type}`).size
  if (size === 0 || size >= 20971520) {
    patchCard(
      JSON.stringify(buildReplyMsg("文件导入失败，文件过大或文件读取失败，请重试或联系管理员。", "message-mute_outlined", "聊天失败。")),
      message_id
    )
  } else {
    const importType = ['xls', 'xlsx', 'csv'].includes(file_type) ? "sheet" : "docx"
    const resUpload = await createUpload(file_name, file, importType, file_type, size)
    if (!resUpload || !resUpload.file_token) {
      patchCard(
        JSON.stringify(buildReplyMsg("文件上传失败，请重试或联系管理员。", "message-mute_outlined", "聊天失败。")),
        message_id
      )
      return
    }
    const resImport = await createImportTask(file_name, resUpload.file_token, importType, file_type)
    if (!resImport || !resImport.data?.ticket) {
      patchCard(
        JSON.stringify(buildReplyMsg("文件导入任务创建失败，请重试或联系管理员。", "message-mute_outlined", "聊天失败。")),
        message_id
      )
      return
    }
    const org_domain = await getOrgDomain()
    let token: string = ""
    const ticket = resImport.data.ticket
    let err_count = 0
    const checkImpot = setInterval(async () => {
      const importResult = await checkImportTask(ticket)
      if (!importResult) {
        err_count++
        if (err_count > 5) {
          patchCard(
            JSON.stringify(buildReplyMsg("轮询文件导入结果失败超过5次，请重试或联系管理员。", "message-mute_outlined", "聊天失败。")),
            message_id
          )
          clearInterval(checkImpot)
          return
        }
      }
      else if (importResult.data?.result?.job_status === 0) {
        token = importResult.data.result.token ? importResult.data.result.token : ""
        if (importType === "docx") {
          const docRaw = await getDocRaw(token)
          if (!docRaw || !docRaw.data) {
            patchCard(
              JSON.stringify(buildReplyMsg("获取文件内容失败，请重试或联系管理员。", "message-mute_outlined", "聊天失败。")),
              message_id
            )
            clearInterval(checkImpot)
            return
          }
          createMongoMsg({
            open_id: res.data?.sender?.id,
            root_id: res.data?.root_id,
            message_id: res.data?.message_id,
            create_time: res.data?.create_time,
            sender: 'system',
            content: docRaw.data.content
          })
          patchCard(
            JSON.stringify(buildReplyMsg(`文件已导入**[云文档](https://${org_domain}/docx/${token})**，请直接回复本信息。\n- **注：**文件内容不宜过于匮乏。`, "chat-done_outlined", "文件内容读取成功。")),
            message_id
          )
          clearInterval(checkImpot)
        } else {
          const sheets = await handleSpreadSheet(token)
          if (sheets) {
            patchCard(
              JSON.stringify(buildSheetCard(sheets, org_domain, token, res.data?.root_id || "", "NoToolId")),
              message_id
            )
          } else {
            patchCard(
              JSON.stringify(buildReplyMsg(`获取子表失败。`, "message-mute_outlined", "俩天失败。")),
              message_id
            )
          }
          clearInterval(checkImpot)
          return
        }
      } else if (importResult.data?.result?.job_status !== 1 && importResult.data?.result?.job_status !== 2) {
        patchCard(
          JSON.stringify(buildReplyMsg(`文件导入失败，错误信息：${importResult}`, "message-mute_outlined", "聊天失败。")),
          message_id
        )
        clearInterval(checkImpot)
      }
    }, check_interval)
    patchCard(
      JSON.stringify(buildReplyMsg("文件导入结果检查中...", "buzz_outlined", "正在导入...")),
      message_id
    )
  }
}

export async function replySheet(
  sheet_info: {
    sheet_id: string,
    row_count: number,
    column_count: number,
    token: string,
    domain: string,
    root_id: string,
    tool_call_id: string
  },
  message_id: string,
  open_id: string,
  create_time: number
) {
  //const sheet_info: { sheet_id: string, row_count: number, column_count: number, token: string, domain: string, message_id: string } = JSON.parse(data.event?.action?.form_value?.sheetSlected || "")
  //const message_id = data.event?.context?.open_message_id || ""
  const resExport = await creatExportTask(sheet_info.token, sheet_info.sheet_id)
  if (!resExport) {
    patchCard(
      JSON.stringify(buildReplyMsg("创建子表内容导入任务失败，请重试或联系管理员。", "message-mute_outlined", "聊天失败。")),
      message_id
    )
    return
  }
  patchCard(
    JSON.stringify(buildReplyMsg("导出子表结果检查中...", "buzz_outlined", "正在导出...")),
    message_id
  )
  const ticket = resExport.data?.ticket || ""
  if (ticket) {
    let err_count = 0
    const checkExport = setInterval(async () => {
      const exportResult = await checkExportTask(sheet_info.token, ticket)
      if (!exportResult) {
        err_count++
        if (err_count > 5) {
          patchCard(
            JSON.stringify(buildReplyMsg("轮询子表内容导出结果失败超过5次，请重试或联系管理员。", "message-mute_outlined", "聊天失败。")),
            message_id
          )
          clearInterval(checkExport)
          return
        }
      }
      else if (exportResult.data?.result?.job_status === 0) {
        const file_token = exportResult.data?.result?.file_token || ""
        const checkDownload = await downloadExportTask(file_token).then(async file => {
          if (!file) {
            return false
          }
          await file.writeFile(`data/${file_token}.csv`)
          return true
        })
        if (!checkDownload) {
          patchCard(
            JSON.stringify(buildReplyMsg("子表内容提取失败，请重试或联系管理员。", "message-mute_outlined", "聊天失败。")),
            message_id
          )
          clearInterval(checkExport)
          return
        }
        const csvRaw = fs.readFileSync(`data/${file_token}.csv`).toString()
        createMongoMsg({
          open_id,
          root_id: sheet_info.root_id,
          message_id,
          create_time,
          sender: sheet_info.tool_call_id === "NoToolId" ? "system" : 'tool',
          content: csvRaw,
          tool_call_id: sheet_info.tool_call_id
        })
        patchCard(
          JSON.stringify(buildReplyMsg(`子表文件内容已导出，请直接回复本信息。\n- **注：**ChatGpt数学运算可能存在问题，请注意核算。`, "chat-done_outlined", "文件内容读取成功。")),
          message_id
        )
        clearInterval(checkExport)
      } else if (exportResult.data?.result?.job_status !== 1 && exportResult.data?.result?.job_status !== 2) {
        patchCard(
          JSON.stringify(buildReplyMsg(`文件导入失败，错误信息：${exportResult}`, "message-mute_outlined", "聊天失败。")),
          message_id
        )
        clearInterval(checkExport)
      }
    }, check_interval)
  }
}