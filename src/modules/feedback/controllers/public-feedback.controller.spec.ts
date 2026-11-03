import { Feedback, FeedbackStatus } from '@prisma/client';
import { CreateFeedbackDto } from '../dto/create-feedback.dto.js';
import { FeedbackService } from '../services/feedback.service.js';
import { PublicFeedbackController } from './public-feedback.controller.js';

describe('PublicFeedbackController', () => {
  it('returns only the ID without disclosing contacts or internal notes', async () => {
    const feedback: Feedback = {
      id: 'feedback-id',
      name: 'Pavel',
      company: null,
      phone: null,
      email: 'a@example.com',
      message: null,
      status: FeedbackStatus.NEW,
      notes: 'private',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const create = vi
      .fn<(dto: CreateFeedbackDto) => Promise<Feedback>>()
      .mockResolvedValue(feedback);
    const controller = new PublicFeedbackController({
      create,
    } as unknown as FeedbackService);

    const response = await controller.create({
      name: 'Pavel',
      email: 'a@example.com',
    });

    expect(response.isSuccess).toBe(true);
    expect(response.responseValue).toEqual({ id: 'feedback-id' });
  });
});
