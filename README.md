## 已开发功能说明(基于gpt-4o-mini和kimi测试，未经充分测试)

- 流式、非流式文本生成。
- 支持格式为docx/doc/txt/md/mark/markdown/xlsx/xls/csv的文件直接拖入。
- 支持图片直接拖入（分析内容），或粘贴后增加自定义提问内容。
- 支持飞书文档云文档、电子表格（非多维表格）的识别和内容提取。（不支持多个链接）

## 先决条件

启动一个mongodb。

## 运行方式

构建docker运行。


## 环境变量

### 飞书应用设置

`FEISHU_APP_ID`=

`FEISHU_APP_SECRET`=

### 飞书encrypt key

`FEISHU_EK`=

### 飞书卡片更新频率，单位为毫秒，在stream=1的时候生效，默认500毫秒。
### 注意飞书的限制：1000 次/分钟、50 次/秒，并发用户多的情况下，请不要设置太低，默认值500。自行测试。

`FEISHU_CARD_INTERVAL`=100

### 轮询文件导入导出的时候可能造成重复更新卡片的问题，可以调整一下这个参数。默认值5000

`FEISHU_CHECK_INTERVAL`=5000

### GPT设置

`API_KEY`=sk-xxx

`API_URL`=https://api.openai.com/v1


### 默认使用的模型，默认值gpt-4o-mini

`DEFAULT_MODEL`=gpt-4o

### GPT回复的TOKEN长度限制，OPENAI请不要超过4096，默认值2048。

`MAX_TOKEN`=2048

### 会话默认前置提示词。最后一句话可能导致一些内容回复为空。

`DEFAULT_PROMT`=你是ChatGpt，由OPENAI 提供的人工智能助手。你会为用户提供安全，有帮助，准确的回答。同时，你会拒绝一切涉及恐怖主义，种族歧视，黄色暴力等问题的回答。

### 启用流模式设置1，不启用设置0

`STREAM`=1

### MONGO服务器设置

`MONGO_DB`=

`MONGO_HOST`=

`MONGO_PORT`=

`MONGO_USER`=

`MONGO_PASS`=


