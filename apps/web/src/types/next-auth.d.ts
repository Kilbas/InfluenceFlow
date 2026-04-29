import "next-auth";
import "next-auth/jwt";
import type { Role } from "@prisma/client";

declare module "next-auth" {
  interface User {
    role: Role;
    workspaceId: string;
  }

  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      role: Role;
      workspaceId: string;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: Role;
    workspaceId?: string;
  }
}
