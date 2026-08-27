import nodemailer from "nodemailer";

let transporter;

export function isMailConfigured() {
  return Boolean(
    process.env.APP_URL
    && process.env.SMTP_HOST
    && process.env.SMTP_PORT
    && process.env.SMTP_USER
    && process.env.SMTP_PASSWORD
    && process.env.EMAIL_FROM
  );
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

async function sendActionEmail({ to, subject, heading, message, actionLabel, actionUrl, expiresText }) {
  await getTransporter().sendMail({
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
  });
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
