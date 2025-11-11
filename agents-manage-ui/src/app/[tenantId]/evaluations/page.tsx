import { ClipboardList, Database, FlaskConical } from 'lucide-react';
import Link from 'next/link';
import { BodyTemplate } from '@/components/layout/body-template';
import { MainContent } from '@/components/layout/main-content';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const dynamic = 'force-dynamic';

async function EvaluationsPage({ params }: PageProps<'/[tenantId]/evaluations'>) {
  const { tenantId } = await params;

  return (
    <BodyTemplate breadcrumbs={[{ label: 'Evaluations', href: `/${tenantId}/evaluations` }]}>
      <MainContent>
        <PageHeader
          title="Evaluations"
          description="Evaluate and test your agents using datasets, evaluators, and test suites."
        />

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <FlaskConical className="h-5 w-5 text-primary" />
                <CardTitle>Evaluators</CardTitle>
              </div>
              <CardDescription>
                Create and manage evaluators to assess agent performance
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link href={`/${tenantId}/evaluations/evaluators`}>
                <Button className="w-full">Manage Evaluators</Button>
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Database className="h-5 w-5 text-primary" />
                <CardTitle>Datasets</CardTitle>
              </div>
              <CardDescription>Create and manage test datasets for evaluations</CardDescription>
            </CardHeader>
            <CardContent>
              <Link href={`/${tenantId}/evaluations/datasets`}>
                <Button className="w-full">Manage Datasets</Button>
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <ClipboardList className="h-5 w-5 text-primary" />
                <CardTitle>Test Suites</CardTitle>
              </div>
              <CardDescription>Configure automated test suite runs and schedules</CardDescription>
            </CardHeader>
            <CardContent>
              <Link href={`/${tenantId}/evaluations/test-suites`}>
                <Button className="w-full">Manage Test Suites</Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </MainContent>
    </BodyTemplate>
  );
}

export default EvaluationsPage;

