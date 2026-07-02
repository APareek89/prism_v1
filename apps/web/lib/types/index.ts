// lib/types/index.ts
//
// The @/lib/types barrel. One import surface for the whole app:
//
//   import type { AuthUser, IndexResult, EmployeeRow, Band } from '@/lib/types';
//
// Shared enums (Band, ConfidenceBand, SizeBucket, Dimension, AttributionMode, KpiId,
// Scope, ...) are defined ONCE in db.ts and re-exported here. The scoring engine keeps
// its own self-contained copy for M0 (ownership-map) and is NOT re-exported here.

export type { Database, Json } from './database.generated';

export type { AttributionMode } from './attribution-mode';

export type {
  // enums
  Scope,
  Band,
  ConfidenceBand,
  SizeBucket,
  Dimension,
  KpiId,
  AppRole,
  ConnectorType,
  ConnectorStatus,
  IndexBand,
  RecKind,
  RecStatus,
  CourseStatus,
  CommsChannel,
  // common
  Timestamp,
  DateString,
  Uuid,
  // rows
  FunctionRow,
  EmployeeRow,
  EmployeeRoleRow,
  IndexConfigRow,
  ConnectorRow,
  GhPrRow,
  GhCommitRow,
  CcSessionRow,
  DeployRow,
  IncidentRow,
  BlameSnapshotRow,
  PrAiLinkRow,
  KpiDailyRow,
  IndexDailyRow,
  InsightRow,
  RecommendationRow,
  CourseRow,
  CommsLogRow,
  PipelineRunRow,
  PipelineStepRow,
} from './db';

export type {
  KpiValue,
  L2,
  Confidence,
  TokensPerPr,
  IndexResult,
  DeltaRow,
} from './scoring';

export type {
  AgentKind,
  PrVerdict,
  AgentInsight,
  ChangeDriver,
  PrLevelResult,
  EvidenceRow,
  AgentScope,
  RecommendationCandidate,
} from './agents';

export type {
  ConnectorHealth,
  IdentityResolution,
  IngestResult,
} from './connectors';

export type { Capability, AuthUser } from './auth';

export type { ProvisionInput, ProvisionResult, RosterCsvRow } from './onboarding';
