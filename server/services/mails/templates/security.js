// securityTemplates.js
const securityTemplates = {
  header: `
      <div style="text-align: center; margin-bottom: 24px;">
        <h1 style="color: #2752E7; margin-top: 12px; font-size: 20px; font-weight: bold;">Ether Universe</h1>
      </div>
    `,

  footer: `
      <div style="margin-top: 32px; border-top: 1px solid #e5e7eb; padding-top: 16px;">
        <p style="font-size: 14px; color: #4b5563;">This is an automated message from Ether Universe Security.</p>
        <p style="font-size: 12px; color: #dc2626; margin-top: 8px;">If you didn't request this action, please ignore this email.</p>
      </div>
    `,
}

securityTemplates.adminPasswordReset = `
      ${securityTemplates.header}
      
      <div style="padding: 24px; background: #ffffff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
        <p style="margin-bottom: 16px;">Hello Admin,</p>
        
        <p style="margin-bottom: 16px;">We received a request to reset your password. First sign in to your admin panel and then click the button below to create a new password for your account. This link will expire in 15 minutes for security reasons.</p>
        
        <p style="margin-bottom: 16px;">If you didn't request this password reset, you can safely ignore this email. Your password will remain unchanged.</p>
  
        <div style="text-align: center; margin: 32px 0;">
          <a href="<%= resetLink %>" 
             style="display: inline-block; background-color: #2752E7; color: #ffffff; font-weight: bold; padding: 12px 24px; border-radius: 8px; text-decoration: none;">
            Reset Password
          </a>
        </div>
  
        <p style="font-size: 14px; color: #4b5563; margin-bottom: 8px;">Or copy and paste this URL into your browser:</p>
        <p style="font-size: 14px; color: #1f2937; word-break: break-all;"><%= resetLink %></p>
      </div>
      
      ${securityTemplates.footer}
    `

securityTemplates.passwordResetConfirmation = `
    ${securityTemplates.header}
    
    <div style="padding: 24px; background: #ffffff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
      <p style="margin-bottom: 16px;">Hello Admin,</p>
      
      <p style="margin-bottom: 16px;">Your password was successfully reset on <%= time.stamp %> ( <%= time.zone %>) .</p>

      <div style="background-color: #f3f4f6; padding: 16px; border-radius: 8px; margin: 24px 0;">
        <p style="margin-bottom: 16px; font-weight: bold;">Password Change Details:</p>
        <ul style="margin: 0; padding-left: 20px; color: #4b5563;">
          <li style="margin-bottom: 8px;">Operating System: <%= os %></li>
          <li style="margin-bottom: 8px;">Location: <%= location %></li>
          <li style="margin-bottom: 8px;">Browser: <%= browser %></li>
        </ul>
      </div>

      <div style="background-color: #f3f4f6; padding: 16px; border-radius: 8px; margin: 24px 0;">
        <p style="color: #4b5563;">If you did not make this change, please contact site manager to reset your password immediately:</p>
      </div>

      <p style="margin-top: 24px;">You can sign in to your account using your new password:</p>
      
      <div style="text-align: center; margin: 32px 0;">
        <a href="<%= signInLink %>" 
           style="display: inline-block; background-color: #2752E7; color: #000000; font-weight: bold; padding: 12px 24px; border-radius: 8px; text-decoration: none;">
          Sign In to Your Account
        </a>
      </div>
    </div>
    
    ${securityTemplates.footer}
  `
export default securityTemplates;