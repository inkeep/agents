import type { FC } from 'react';
import { SkillForm } from '@/components/skills/form/skill-form';

const NewSkillPage: FC = async () => {
  return <SkillForm className="max-w-4xl mx-auto" />;
};

export default NewSkillPage;
