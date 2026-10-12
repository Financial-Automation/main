import nodemailer from "nodemailer";

/**
 * Sends a secure password reset email.
 * Falls back to console printing if SMTP configuration is not present.
 * 
 * @param {string} email - Destination email address
 * @param {string} resetUrl - Complete reset password URL
 */
export const sendResetEmail = async (email, resetUrl) => {
  const smtpHost = process.env.SMTP_HOST || "smtp.gmail.com";
  const smtpPort = parseInt(process.env.SMTP_PORT || "587");
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpFrom = process.env.SMTP_FROM || smtpUser || "noreply@shreeandalai.com";

  if (!smtpUser || !smtpPass) {
    if (process.env.NODE_ENV === "production") {
      console.warn("⚠️ SMTP credentials not configured in production environment. Email delivery skipped.");
      return { success: false, message: "SMTP service unconfigured." };
    }
    console.log("\n=========================================");
    console.log(`[DEV ONLY] 📧 PASSWORD RESET LINK FOR: ${email}`);
    console.log(`[DEV ONLY] 🔗 Reset URL: ${resetUrl}`);
    console.log("=========================================\n");
    console.warn("⚠️ SMTP credentials not configured in development environment. Reset link printed to console above.");
    return { success: true, printedToConsole: true };
  }

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
  });

  const mailOptions = {
    from: `"SHREE ANDAL AI Support" <${smtpFrom}>`,
    to: email,
    subject: "Reset Password Request - SHREE ANDAL AI",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 25px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
        <div style="text-align: center; margin-bottom: 25px;">
          <h2 style="color: #0f172a; margin: 0; font-size: 24px; font-weight: 700; letter-spacing: -0.025em;">SHREE ANDAL AI</h2>
        </div>
        <div style="border-top: 1px solid #f1f5f9; padding-top: 25px;">
          <p style="color: #334155; font-size: 15px; line-height: 1.6; margin-bottom: 16px;">Hello,</p>
          <p style="color: #334155; font-size: 15px; line-height: 1.6; margin-bottom: 24px;">We received a request to reset the password for your account associated with <strong>${email}</strong>.</p>
          
          <div style="text-align: center; margin: 32px 0;">
            <a href="${resetUrl}" style="background-color: #0f172a; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-size: 15px; font-weight: 600; display: inline-block; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">Reset Password</a>
          </div>

          <p style="color: #ef4444; font-size: 13px; font-weight: 500; margin-bottom: 24px;">⚡ This secure password reset link will expire in 30 minutes.</p>
          
          <p style="color: #64748b; font-size: 13px; line-height: 1.6; border-top: 1px solid #f1f5f9; padding-top: 20px; margin-top: 30px;">
            If you did not request a password reset, please disregard this email. Your password will remain completely secure and unchanged.
          </p>
        </div>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
  return { success: true };
};

/**
 * Sends a website lead notification email to shreeandal.ai@gmail.com.
 * Falls back to console printing if SMTP configuration is not present.
 * 
 * @param {Object} lead - Lead information
 * @param {string} lead.fullName - Full name of the lead
 * @param {string} lead.email - Email address of the lead
 * @param {string} lead.phone - Phone number of the lead
 * @param {string} [lead.business] - Business description (optional)
 */
export const sendLeadEmail = async ({ fullName, email, phone, business }) => {
  const smtpHost = process.env.SMTP_HOST || "smtp.gmail.com";
  const smtpPort = parseInt(process.env.SMTP_PORT || "587");
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpFrom = process.env.SMTP_FROM || smtpUser || "shreeandal.ai@gmail.com";
  const targetRecipient = "shreeandal.ai@gmail.com";

  const plainTextBody = `New Website Lead\n\nName: ${fullName}\nEmail: ${email}\nPhone: ${phone}\nBusiness: ${business || "N/A"}`;

  if (!smtpUser || !smtpPass) {
    if (process.env.NODE_ENV === "production") {
      console.warn("⚠️ SMTP credentials not configured in production environment. Lead email delivery skipped.");
      return { success: false, message: "SMTP service unconfigured." };
    }
    console.log("\n=========================================");
    console.log(`[DEV ONLY] 📧 NEW WEBSITE LEAD NOTIFICATION FOR: ${targetRecipient}`);
    console.log(`[DEV ONLY] 👤 Name: ${fullName}`);
    console.log(`[DEV ONLY] ✉️ Email: ${email}`);
    console.log(`[DEV ONLY] 📞 Phone: ${phone}`);
    console.log(`[DEV ONLY] 🏢 Business: ${business || "N/A"}`);
    console.log("=========================================\n");
    console.warn("⚠️ SMTP credentials not configured in development environment. Lead notification printed to console above.");
    return { success: true, printedToConsole: true };
  }

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
  });

  const mailOptions = {
    from: `"SHREE ANDAL AI Lead Desk" <${smtpFrom}>`,
    to: targetRecipient,
    subject: `New Website Lead - ${fullName}`,
    text: plainTextBody,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 25px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
        <div style="border-bottom: 2px solid #3b82f6; padding-bottom: 12px; margin-bottom: 20px;">
          <h2 style="color: #0f172a; margin: 0; font-size: 22px; font-weight: 700;">New Website Lead</h2>
        </div>
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 10px 0; color: #64748b; font-weight: 600; width: 100px;">Name:</td>
            <td style="padding: 10px 0; color: #0f172a; font-weight: 600;">${fullName}</td>
          </tr>
          <tr>
            <td style="padding: 10px 0; color: #64748b; font-weight: 600;">Email:</td>
            <td style="padding: 10px 0; color: #2563eb; font-weight: 600;"><a href="mailto:${email}" style="color: #2563eb; text-decoration: none;">${email}</a></td>
          </tr>
          <tr>
            <td style="padding: 10px 0; color: #64748b; font-weight: 600;">Phone:</td>
            <td style="padding: 10px 0; color: #0f172a; font-weight: 600;">${phone}</td>
          </tr>
          <tr>
            <td style="padding: 10px 0; color: #64748b; font-weight: 600; vertical-align: top;">Business:</td>
            <td style="padding: 10px 0; color: #334155; line-height: 1.5;">${business ? business.replace(/\n/g, '<br/>') : "N/A"}</td>
          </tr>
        </table>
        <div style="margin-top: 25px; padding-top: 15px; border-top: 1px solid #f1f5f9; color: #94a3b8; font-size: 12px;">
          Submitted via SHREE ANDAL AI Website Trial/Demo Form.
        </div>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
  return { success: true };
};

