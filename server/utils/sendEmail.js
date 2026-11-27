import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

const createTransporter = () => {
  return nodemailer.createTransport({
    service: process.env.SERVICE || "Gmail",
    auth: {
      user: process.env.USER,
      pass: process.env.PASS,
    },
  });
};

export const sendEmail = async ({ to, subject, html, text, attachments = [] }) => {
  const transporter = createTransporter();
  const fromAddress = process.env.USER || "meshakokelo@gmail.com";

  return transporter.sendMail({
    from: `"FreshMart Grocery Store" <${fromAddress}>`,
    to,
    subject,
    text: text || subject,
    html,
    ...(Array.isArray(attachments) && attachments.length > 0 ? { attachments } : {}),
  });
};

export default sendEmail;
