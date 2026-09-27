import nodemailer from "nodemailer";
import { getServerEnv } from "@/config/env";

export async function sendMail(input: {
  to: string;
  subject: string;
  text: string;
}) {
  const env = getServerEnv();
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS || !env.SMTP_FROM) {
    throw new Error("SMTP is not configured");
  }

  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
    },
  });

  await transporter.sendMail({
    from: env.SMTP_FROM,
    to: input.to,
    subject: input.subject,
    text: input.text,
  });
}
