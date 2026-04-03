const mongoose = require("mongoose");

const ChatSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true // 🔥 fast query
    },

    messages: {
      type: [
        {
          role: {
            type: String,
            enum: ["user", "assistant"],
            required: true
          },
          content: {
            type: String,
            required: true
          }
        }
      ],
      default: [] // 🔥 IMPORTANT (fix for push error)
    }
  },
  {
    timestamps: true
  }
);

// 🔥 Auto cleanup (optional - future use)
ChatSchema.methods.clearMessages = function () {
  this.messages = [];
  return this.save();
};

module.exports = mongoose.model("Chat", ChatSchema);
