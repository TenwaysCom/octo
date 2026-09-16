export interface LarkContactRecord {
  openId: string;
  email: string | null;
  name: string | null;
  meegleUserKey: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LarkContactStore {
  getByOpenId(openId: string): Promise<LarkContactRecord | undefined>;
  getByEmail(email: string): Promise<LarkContactRecord | undefined>;
  getByMeegleUserKey(meegleUserKey: string): Promise<LarkContactRecord | undefined>;
  upsert(input: {
    openId: string;
    email?: string | null;
    name?: string | null;
    meegleUserKey?: string | null;
  }): Promise<LarkContactRecord>;
}
