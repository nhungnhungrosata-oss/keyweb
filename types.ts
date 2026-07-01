export enum PlanType {
  ONE_MONTH = '1m',
  TWO_MONTHS = '2m',
  FOREVER = 'forever',
  CUSTOM = 'custom',
}

export interface ActivatePayload {
  device_key: string;
  plan: PlanType;
  custom_days?: number;
  note?: string;
}

export interface CheckPayload {
  device_key: string;
  app_id?: string;
  device_id?: string;
  device_fingerprint?: string;
  device_name?: string;
  platform?: string;
  timezone?: string;
  user_agent?: string;
  device?: any;
}

export interface RevokePayload {
  device_key: string;
}

export interface ResetDevicePayload {
  device_key: string;
}

export interface ApiResponse {
  success: boolean;
  message?: string;
  data?: any;
  error?: string;
}
