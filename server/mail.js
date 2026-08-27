import nodemailer from "nodemailer";

let transporter;

export function isMailConfigured() {
  const hasApiProvider = Boolean(process.env.BREVO_API_KEY);
  const hasSmtpProvider = Boolean(
    process.env.SMTP_HOST && process.env.SMTP_PORT
    && process.env.SMTP_USER && process.env.SMTP_PASSWORD
  );
  return Boolean(process.env.APP_URL && process.env.EMAIL_FROM && (hasApiProvider || hasSmtpProvider));
}

function getTransporter() {
  if (!isMailConfigured()) {
    const error = new Error("Email delivery is not configured on the server.");
    error.code = "EMAIL_NOT_CONFIGURED";
    throw error;
  }
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT);
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: String(process.env.SMTP_SECURE).toLowerCase() === "true" || port === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      },
    });
  }
  return transporter;
}

function parseSender(value) {
  const match = String(value).match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (match) return { name: match[1].replace(/^['"]|['"]$/g, "").trim(), email: match[2].trim() };
  return { name: "Tourism Arrivals System", email: String(value).trim() };
}

async function sendWithBrevo(message) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        accept: "application/json",
        "api-key": process.env.BREVO_API_KEY,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        sender: parseSender(process.env.EMAIL_FROM),
        to: [{ email: message.to }],
        subject: message.subject,
        textContent: message.text,
        htmlContent: message.html,
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      const error = new Error(body.message || `Email API request failed (${response.status}).`);
      error.code = "EMAIL_API_ERROR";
      throw error;
    }
  } catch (error) {
    if (error.name === "AbortError") {
      const timeoutError = new Error("Email API request timed out.");
      timeoutError.code = "EMAIL_API_ERROR";
      throw timeoutError;
    }
    if (!error.code) error.code = "EMAIL_API_ERROR";
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function sendActionEmail({ to, subject, heading, message, actionLabel, actionUrl, expiresText }) {
  const mail = {
    from: process.env.EMAIL_FROM,
    to,
    subject,
    text: `${heading}\n\n${message}\n\n${actionLabel}: ${actionUrl}\n\n${expiresText}\nIf you did not request this, you can ignore this email.`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#173f43">
        <h2>${heading}</h2>
        <p>${message}</p>
        <p style="margin:28px 0">
          <a href="${actionUrl}" style="background:#dca942;color:#073f43;padding:12px 18px;border-radius:7px;text-decoration:none;font-weight:700">${actionLabel}</a>
        </p>
        <p style="font-size:13px;color:#5d6f70">${expiresText}</p>
        <p style="font-size:13px;color:#5d6f70">If you did not request this, you can ignore this email.</p>
      </div>
    `,
  };
  if (process.env.BREVO_API_KEY) return sendWithBrevo(mail);
  return getTransporter().sendMail(mail);
}

export function sendVerificationEmail(email, token) {
  const url = `${process.env.APP_URL.replace(/\/+$/, "")}/?verifyEmail=${encodeURIComponent(token)}`;
  return sendActionEmail({
    to: email,
    subject: "Verify your Tourism Arrivals account",
    heading: "Verify your email address",
    message: "Confirm this email address to activate your Tourism Arrivals System account.",
    actionLabel: "Verify email",
    actionUrl: url,
    expiresText: "This verification link expires in 24 hours.",
  });
}

export function sendPasswordResetEmail(email, token) {
  const url = `${process.env.APP_URL.replace(/\/+$/, "")}/?resetPassword=${encodeURIComponent(token)}`;
  return sendActionEmail({
    to: email,
    subject: "Reset your Tourism Arrivals password",
    heading: "Reset your password",
    message: "Use the secure link below to choose a new password.",
    actionLabel: "Reset password",
    actionUrl: url,
    expiresText: "This password-reset link expires in 1 hour and can only be used once.",
  });
}
