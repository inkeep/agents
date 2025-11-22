import CopilotStandaloneInput from './copilot-standalone-input';

export const CopilotSection = () => {
  return (
    <div className="w-2xl max-w-screen">
      <h3 className="text-lg text-muted-foreground font-medium text-center mb-3">
        What would you like to build?
      </h3>
      <CopilotStandaloneInput />
    </div>
  );
};
