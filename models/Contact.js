const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const contactSchema = new mongoose.Schema({
  first_name: { 
    type: String,
    required: true
  },
  last_name: {
    type: String,
    required: true
  },
  whatsappnumber: {
    type: Number,
    required: true
  },
  email: {
    type: String,
    required: true 
    },
  message: {
    type: String,
    required: true
    },
},
{ timestamps: true });

module.exports = mongoose.model('Contact', contactSchema);
