export const AccessOperation = {
  Login: 'LOGIN',
} as const;

export type AccessOperation =
  (typeof AccessOperation)[keyof typeof AccessOperation];
