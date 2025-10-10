// 'use client';

// import { ChevronRight, Info } from 'lucide-react';
// import { useEffect, useState } from 'react';
// import { type Control, useFormState } from 'react-hook-form';
// import { GenericInput } from '@/components/form/generic-input';
// import { GenericSelect } from '@/components/form/generic-select';
// import { Button } from '@/components/ui/button';
// import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
// import { InfoCard } from '@/components/ui/info-card';
// import { Label } from '@/components/ui/label';
// import type { ProjectFormData } from './validation';

// interface ProjectSandboxSectionProps {
//   control: Control<ProjectFormData>;
// }

// const providerOptions = [
//   { value: 'local', label: 'Local' },
//   { value: 'vercel', label: 'Vercel' },
//   { value: 'daytona', label: 'Daytona' },
// ];

// const runtimeOptions = [
//   { value: 'node22', label: 'Node.js 22' },
//   { value: 'typescript', label: 'TypeScript' },
// ];

// export function ProjectSandboxSection({ control }: ProjectSandboxSectionProps) {
//   const [isOpen, setIsOpen] = useState(false);
//   const { errors } = useFormState({ control });

//   const hasSandboxErrors = !!(
//     errors.sandboxConfig?.provider ||
//     errors.sandboxConfig?.runtime ||
//     errors.sandboxConfig?.timeout ||
//     errors.sandboxConfig?.vcpus
//   );

//   // Auto-open the collapsible when there are errors in the sandbox section
//   useEffect(() => {
//     if (hasSandboxErrors) {
//       setIsOpen(true);
//     }
//   }, [hasSandboxErrors]);

//   return (
//     <div className="space-y-4">
//       <div>
//         <Label className="text-sm font-medium">Sandbox configuration</Label>
//         <p className="text-sm text-muted-foreground mt-1">
//           Configure the execution environment for functions in this project
//         </p>
//       </div>

//       <Collapsible
//         open={isOpen}
//         onOpenChange={setIsOpen}
//         className="border rounded-md bg-background"
//       >
//         <CollapsibleTrigger asChild>
//           <Button
//             type="button"
//             variant="ghost"
//             size="sm"
//             className="flex items-center justify-start gap-2 w-full group p-0 h-auto hover:!bg-transparent transition-colors py-2 px-4"
//           >
//             <ChevronRight className="h-4 w-4 transition-transform duration-200 group-data-[state=open]:rotate-90" />
//             Configure sandbox settings
//           </Button>
//         </CollapsibleTrigger>
//         <CollapsibleContent className="space-y-6 mt-4 data-[state=closed]:animate-[collapsible-up_200ms_ease-out] data-[state=open]:animate-[collapsible-down_200ms_ease-out] overflow-hidden px-4 pb-6">
//           <div className="space-y-4">
//             <GenericSelect
//               control={control}
//               name="sandboxConfig.provider"
//               label="Provider"
//               description="Choose the sandbox provider for function execution."
//               options={providerOptions}
//               placeholder="Select a provider"
//               selectTriggerClassName="w-full"
//               isRequired
//             />

//             <GenericSelect
//               control={control}
//               name="sandboxConfig.runtime"
//               label="Runtime"
//               description="Select the runtime environment for your functions."
//               options={runtimeOptions}
//               placeholder="Select a runtime"
//               selectTriggerClassName="w-full"
//               isRequired
//             />

//             <GenericInput
//               control={control}
//               name="sandboxConfig.timeout"
//               label="Timeout (ms)"
//               placeholder="30000"
//               description="Maximum execution time for functions in milliseconds (1000-300000)."
//               type="number"
//               min="1000"
//               max="300000"
//             />

//             <GenericInput
//               control={control}
//               name="sandboxConfig.vcpus"
//               label="vCPUs"
//               placeholder="1"
//               description="Number of virtual CPUs allocated for function execution (1-8)."
//               type="number"
//               min="1"
//               max="8"
//             />
//           </div>

//           <InfoCard title="Sandbox configuration info:" Icon={Info}>
//             <div className="text-sm space-y-2">
//               <p>
//                 <strong>Local:</strong> Functions run in your local environment with full access to
//                 system resources.
//               </p>
//               <p>
//                 <strong>Vercel:</strong> Functions run on Vercel's serverless platform with
//                 automatic scaling.
//               </p>
//               <p>
//                 <strong>Daytona:</strong> Functions run in isolated development environments with
//                 persistent storage.
//               </p>
//             </div>
//           </InfoCard>
//         </CollapsibleContent>
//       </Collapsible>
//     </div>
//   );
// }
