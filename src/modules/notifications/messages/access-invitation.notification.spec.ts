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
      new ConfigService({
        app: { locale: 'ru' },
        frontend: { domain: 'https://klendo.by' },
      }),
    );
    renderer.onModuleInit();
    const result = renderer.render(notification.emailTemplate, payload.data);
    expect(payload.to).toBe('member@example.com');
    expect(result.html).toContain('Example Brand');
    expect(result.html).toContain('https://crm.example/invite/token');
    expect(result.html).toContain('Вас приглашают получить доступ к');
    expect(result.html).not.toContain('в качестве сотрудника');
  });

  it('tells until when the invitation can be accepted', () => {
    const notification = new AccessInvitationNotification(
      'member@example.com',
      'https://crm.example/invite/token',
      'Example Brand',
      null,
      new Date('2026-11-21T10:00:00Z'),
    );
    const renderer = new EmailRenderer(
      new ConfigService({
        app: { locale: 'ru' },
        frontend: { domain: 'https://klendo.by' },
      }),
    );
    renderer.onModuleInit();
    const result = renderer.render(
      notification.emailTemplate,
      notification.toEmail().data,
    );
    expect(result.html).toContain('Приглашение действует до');
    expect(result.html).toContain('21 ноября');
  });
});
