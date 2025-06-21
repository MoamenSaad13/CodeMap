const Contact = require("../models/Contact");

// POST /api/contact-us
const createMessage = async (req, res) => {
  try {
    const { first_name, last_name, whatsappnumber, email, message } = req.body;

    // Basic validation
    if (!first_name || !last_name || !whatsappnumber || !email || !message) {
      return res.status(400).json({ message: "All fields are required." });
    }

    // Create & save
    const contact = new Contact({
      first_name,
      last_name,
      whatsappnumber,
      email,
      message,
    });

    await contact.save();
    res
      .status(201)
      .json({ message: "Your message has been received. Thank you!" });
  } catch (err) {
    console.error("Error saving contact message:", err);
    res.status(500).json({ message: "Server error. Please try again later." });
  }
};

// GET /api/contact-us/messages (or a similar route to be defined)
// @desc Get all contact messages
// @access Private (Admin only - to be enforced by middleware in routes)
const getAllMessages = async (req, res) => {
  // #swagger.tags = ["Contact"]
  // #swagger.description = "Get all contact messages (Admin only)"
  // #swagger.security = [{ "bearerAuth": [] }] // Assuming JWT auth for admin
  try {
    const messages = await Contact.find().sort({ createdAt: -1 }).lean(); // Sort by newest first
    if (!messages?.length) {
      return res.status(404).json({ message: "No contact messages found." });
    }
    res.json(messages);
  } catch (error) {
    console.error("Error fetching contact messages:", error);
    res.status(500).json({ message: "Server error fetching contact messages." });
  }
};

module.exports = {
  createMessage,
  getAllMessages, // Export the new function
};