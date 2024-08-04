import express from "express"
import { decryptEvent, patchCard, replyFile, replyMessage, replySheet, sendMessage } from "./feishu"
import { buildReplyMsg } from "./Templates";

const app = express()
const port = 5300;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));


app.post('/event', async (req, res) => {
  const data = JSON.parse(decryptEvent(req.body.encrypt))
  const challenge = data.challenge
  if (challenge) {
    return res.json({ challenge })
  }
  if (!data.event) {
    return res.json({ error: true })
  }
  if (data.header.event_type === "im.chat.access_event.bot_p2p_chat_entered_v1") {
    sendMessage(data)
    return res.json({ error: false }).status(200)
  } else if (data.header.event_type === "im.message.receive_v1") {
    const jsonContent: { file_key: string, file_name: string } = JSON.parse(data.event.message.content)
    if (jsonContent.file_key && jsonContent.file_name) {
      const file_type = jsonContent.file_name.split('.').pop() || ""
      const message_id=data.event?.message?.message_id
      if (file_type && message_id){
        replyFile(message_id, jsonContent.file_key, jsonContent.file_name, file_type)
      } else {
        return res.json({ error: true }).status(200)
      }
    } else {
      try {
        const open_id: string = data.event.sender.sender_id.open_id
        const message_id: string = data.event.message.message_id
        const root_id: string = data.event.message.root_id
        const create_time: string = data.event.message.create_time
        const content: string = data.event.message.content
        if (open_id && message_id && create_time && content) {
          replyMessage(open_id, message_id, root_id ? root_id : message_id, create_time, content, false)
        }
      } catch (e) {
        console.log(data)
        return res.json({ error: true }).status(200)
      }
    }
    return res.json({ error: false }).status(200)
  } else {
    return res.json({ error: true }).status(200)
  }
})

app.post('/card', async (req, res) => {
  const data = JSON.parse(decryptEvent(req.body.encrypt))
  const challenge = data.challenge
  if (challenge) {
    return res.json({ challenge }).status(200)
  }
  if (!data.event) {
    return res.json({ error: true }).status(200)
  }
  if (data.event?.action?.form_value?.sheetSlected) {
    patchCard(
      JSON.stringify(buildReplyMsg('已接收到请求...', "buzz_outlined", "正在导出...")),
      data.event?.context?.open_message_id
    )
    const sheet_info: { sheet_id: string, row_count: number, column_count: number, token: string, domain: string, root_id: string, tool_call_id:string } = JSON.parse(data.event?.action?.form_value?.sheetSlected || "")
    const message_id = data.event?.context?.open_message_id
    const open_id=data.event.operator.open_id
    const create_time= parseInt(data.header.create_time) || 0
    replySheet(sheet_info,message_id,open_id,create_time)
    return res.json({ error: false }).status(200)
  }
})


app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});