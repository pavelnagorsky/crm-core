import { ConfigService } from '@nestjs/config';
import { EmailRenderer } from '../channels/email/email.renderer.js';
import { AccessInvitationNotification } from './access-invitation.notification.js';

describe('AccessInvitationNotification', () => {
  it('renders a generic invitation with the brand name and acceptance link', () => {
    const notification = new AccessInvitationNotification(
      'member@example.com',
      'https://crm.example/invite/token',
      'Example Brand',
    );
    const payload = notification.toEmail();
    const renderer = new EmailRenderer(
      new ConfigService({ app: { locale: 'ru' } }),
    );
    renderer.onModuleInit();
    const result = renderer.render(notification.emailTemplate, payload.data);
    expect(payload.to).toBe('member@example.com');
    expect(result.html).toContain('Example Brand');
    expect(result.html).toContain('https://crm.example/invite/token');
    expect(result.html).toContain('Вас приглашают получить доступ к бренду');
    expect(result.html).not.toContain('в качестве сотрудника');
  });
});
