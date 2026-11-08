export const Role = {
  Admin: 'ADMIN',
  Lawyer: 'LAWYER',
  Client: 'CLIENT',
} as const;

export type Role = (typeof Role)[keyof typeof Role];
