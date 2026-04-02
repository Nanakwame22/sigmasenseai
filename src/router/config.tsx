import React from 'react';
import type { RouteObject } from 'react-router-dom';
import { lazy } from 'react';
import ResendConfirmationPage from '../pages/auth/ResendConfirmationPage';

const HomePage = lazy(() => import('../pages/home/page'));
const ProductTourPage = lazy(() => import('../pages/product-tour/page'));
const UseCasesPage = lazy(() => import('../pages/use-cases/page'));
const CaseStudiesPage = lazy(() => import('../pages/case-studies/page'));
const NotFound = lazy(() => import('../pages/NotFound'));
const LoginPage = lazy(() => import('../pages/auth/LoginPage'));
const SignupPage = lazy(() => import('../pages/auth/SignupPage'));
const ForgotPasswordPage = lazy(() => import('../pages/auth/ForgotPasswordPage'));
const OnboardingPage = lazy(() => import('../pages/onboarding/OnboardingPage'));
const DashboardLayout = lazy(() => import('../components/layout/DashboardLayout'));
const DashboardHome = lazy(() => import('../pages/dashboard/DashboardHome'));
const MetricsPage = lazy(() => import('../pages/dashboard/MetricsPage'));
const AlertsPage = lazy(() => import('../pages/dashboard/alerts/AlertsPage'));
const KPIScorecards = lazy(() => import('../pages/dashboard/KPIScorecards'));
const KPIAggregationPage = lazy(() => import('../pages/dashboard/KPIAggregationPage'));
const KPIManagerPage = lazy(() => import('../pages/dashboard/KPIManagerPage'));
const RootCausePage = lazy(() => import('../pages/dashboard/RootCausePage'));
const HypothesisTestingPage = lazy(() => import('../pages/dashboard/HypothesisTestingPage'));
const AnomalyDetectionPage = lazy(() => import('../pages/dashboard/AnomalyDetectionPage'));
const WhatIfPage = lazy(() => import('../pages/dashboard/WhatIfPage'));
const SimulationsPage = lazy(() => import('../pages/dashboard/SimulationsPage'));
const BenchmarkingPage = lazy(() => import('../pages/dashboard/BenchmarkingPage'));
const DMAICPage = lazy(() => import('../pages/dashboard/DMAICPage'));
const AuditLogPage = lazy(() => import('../pages/dashboard/AuditLogPage'));
const KaizenPage = lazy(() => import('../pages/dashboard/KaizenPage'));
const ProjectTemplatesPage = lazy(() => import('../pages/dashboard/ProjectTemplatesPage'));
const KnowledgeLibraryPage = lazy(() => import('../pages/dashboard/KnowledgeLibraryPage'));
const DataIntegrationPage = lazy(() => import('../pages/dashboard/DataIntegrationPage'));
const DataCleaningPage = lazy(() => import('../pages/dashboard/DataCleaningPage'));
const DataMappingPage = lazy(() => import('../pages/dashboard/DataMappingPage'));
const DataQualityPage = lazy(() => import('../pages/dashboard/DataQualityPage'));
const AutomationRulesPage = lazy(() => import('../pages/dashboard/AutomationRulesPage'));
const TeamPage = lazy(() => import('../pages/dashboard/TeamPage'));
const OrganizationPage = lazy(() => import('../pages/dashboard/OrganizationPage'));
const ETLPipelinesPage = lazy(() => import('../pages/dashboard/ETLPipelinesPage'));
const APIWebhooksPage = lazy(() => import('../pages/dashboard/APIWebhooksPage'));
const ActionTrackerPage = lazy(() => import('../pages/dashboard/ActionTrackerPage'));
const SOPBuilderPage = lazy(() => import('../pages/dashboard/SOPBuilderPage'));
const AIMPage = lazy(() => import('../pages/aim/page'));
const CPIPage = lazy(() => import('../pages/cpi/page'));
const ClusteringPage = lazy(() => import('../pages/dashboard/ClusteringPage'));
const ClassificationPage = lazy(() => import('../pages/dashboard/ClassificationPage'));
const AdvancedForecastingPage = lazy(() => import('../pages/dashboard/AdvancedForecastingPage'));
const AIInsightsPage = lazy(() => import('../pages/dashboard/AIInsightsPage'));
const ControlPage = lazy(() => import('../pages/dashboard/ControlPage'));
const AnalyzePage = lazy(() => import('../pages/dashboard/AnalyzePage'));

const routes: RouteObject[] = [
  {
    path: '/',
    element: <HomePage />,
  },
  {
    path: '/product-tour',
    element: <ProductTourPage />,
  },
  {
    path: '/use-cases',
    element: <UseCasesPage />,
  },
  {
    path: '/case-studies',
    element: <CaseStudiesPage />,
  },
  {
    path: '/auth/login',
    element: <LoginPage />,
  },
  {
    path: '/auth/signup',
    element: <SignupPage />,
  },
  {
    path: '/auth/forgot-password',
    element: <ForgotPasswordPage />,
  },
  {
    path: '/auth/resend-confirmation',
    element: <ResendConfirmationPage />,
  },
  {
    path: '/onboarding',
    element: <OnboardingPage />,
  },
  {
    path: '/dashboard',
    element: <DashboardLayout />,
    children: [
      { path: '', element: <DashboardHome /> },
      { path: 'metrics', element: <MetricsPage /> },
      { path: 'alerts', element: <AlertsPage /> },
      { path: 'kpi-scorecards', element: <KPIScorecards /> },
      { path: 'kpi-aggregation', element: <KPIAggregationPage /> },
      { path: 'kpi-manager', element: <KPIManagerPage /> },
      { path: 'root-cause', element: <RootCausePage /> },
      { path: 'hypothesis-testing', element: <HypothesisTestingPage /> },
      { path: 'anomaly-detection', element: <AnomalyDetectionPage /> },
      { path: 'what-if', element: <WhatIfPage /> },
      { path: 'simulations', element: <SimulationsPage /> },
      { path: 'benchmarking', element: <BenchmarkingPage /> },
      { path: 'dmaic', element: <DMAICPage /> },
      { path: 'control', element: <ControlPage /> },
      { path: 'audit-log', element: <AuditLogPage /> },
      { path: 'kaizen', element: <KaizenPage /> },
      { path: 'templates', element: <ProjectTemplatesPage /> },
      { path: 'knowledge-library', element: <KnowledgeLibraryPage /> },
      { path: 'data-integration', element: <DataIntegrationPage /> },
      { path: 'data-cleaning', element: <DataCleaningPage /> },
      { path: 'data-mapping', element: <DataMappingPage /> },
      { path: 'data-quality', element: <DataQualityPage /> },
      { path: 'automation-rules', element: <AutomationRulesPage /> },
      { path: 'etl-pipelines', element: <ETLPipelinesPage /> },
      { path: 'api-webhooks', element: <APIWebhooksPage /> },
      { path: 'team', element: <TeamPage /> },
      { path: 'organization', element: <OrganizationPage /> },
      { path: 'action-tracker', element: <ActionTrackerPage /> },
      { path: 'sop-builder', element: <SOPBuilderPage /> },
      { path: 'clustering', element: <ClusteringPage /> },
      { path: 'classification', element: <ClassificationPage /> },
      { path: 'advanced-forecasting', element: <AdvancedForecastingPage /> },
      { path: 'ai-insights', element: <AIInsightsPage /> },
      { path: 'aim', element: <AIMPage /> },
      { path: 'cpi', element: <CPIPage /> },
      { path: 'analyze', element: <AnalyzePage /> },
    ],
  },
  {
    path: '*',
    element: <NotFound />,
  },
];

export default routes;
