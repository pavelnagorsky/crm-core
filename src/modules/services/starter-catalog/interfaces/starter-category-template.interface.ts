import { StarterServiceTemplate } from './starter-service-template.interface.js';

export interface StarterCategoryTemplate {
  name: string;
  services: readonly StarterServiceTemplate[];
}
