import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config()

const mongo_db = process.env.MONGO_DB
const mongo_host = process.env.MONGO_HOST
const mongo_port = process.env.MONGO_PORT
const mongo_user = process.env.MONGO_USER
const mongo_pass = process.env.MONGO_PASS

mongoose.connect(`mongodb://${mongo_host}:${mongo_port}`, {
  dbName: mongo_db,
  user: mongo_user,
  pass: mongo_pass
}).then(() => {
  console.log('MongoDB connected');
}).catch(err => {
  console.error('MongoDB connection error:', err);
});

const MsgSchema = new mongoose.Schema({
  open_id: { type: String, required: true },
  root_id: { type: String, required: true },
  message_id: { type: String, required: true },
  sender: { type: String, required: true },
  create_time: { type: Date, required: true },
  content: String,
  tool_calls: [{
    function: {
      type:Object,
      required:true,
      arguments: { type: String, required: true },
      name: { type: String, required: true }
    },
    id: { type: String, required: true },
    type: { type: String, default: 'function' ,required: true }
  }],
  tool_call_id: String,
  prompt_tokens: Number,
  completion_tokens: Number,
});


const Msg = mongoose.model('Msg', MsgSchema);

export async function createMongoMsg(msgData: any) {
  try {
    const newMsg = new Msg(msgData);
    const save = await newMsg.save();
    return save._id
  } catch (error) {
    console.error('Error creating msg:', error);
  }
}

export async function findMongoMsg(root_id: string) {
  try {
    const msgs = await Msg.find({
      root_id: root_id
    });
    return msgs
  } catch (error) {
    console.error('Error finding msgs:', error);
    return null
  }
}

/* 不需要
export async function updateMsg(message_id:string, updateData) {
  try {
      const updatedMsg = await Msg.findByIdAndUpdate(userId, updateData, { new: true });
      console.log('Msg updated:', updatedMsg);
  } catch (error) {
      console.error('Error updating msg:', error);
  }
}


export async function deleteMongoMsg(_id: mongoose.Types.ObjectId) {
  try {
    await Msg.findByIdAndDelete({
      _id
    });
    console.log(`Msg [${_id}] deleted`);
  } catch (error) {
    console.error('Error deleting msg:', error);
  }
}
*/

