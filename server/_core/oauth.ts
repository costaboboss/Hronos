import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import { OAuth2Client } from "google-auth-library";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { ENV } from "./env";
import { sdk } from "./sdk";

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

function registerManusOAuthRoutes(app: Express) {
  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");

    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }

    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);

      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }

      await db.upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: new Date(),
      });

      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, {
        ...cookieOptions,
        maxAge: ONE_YEAR_MS,
      });
      res.redirect(302, "/");
    } catch (error) {
      console.error("[OAuth] Manus callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}

function registerGoogleOAuthRoutes(app: Express) {
  function getGoogleClient(redirectUri: string) {
    return new OAuth2Client(
      ENV.googleClientId,
      ENV.googleClientSecret,
      redirectUri
    );
  }

  app.get("/api/oauth/google", (req: Request, res: Response) => {
    const origin =
      getQueryParam(req, "origin") || `${req.protocol}://${req.get("host")}`;
    const redirectUri = `${origin}/api/oauth/callback/google`;
    const client = getGoogleClient(redirectUri);
    const url = client.generateAuthUrl({
      access_type: "offline",
      scope: ["openid", "email", "profile"],
      state: Buffer.from(JSON.stringify({ origin })).toString("base64"),
    });

    res.redirect(302, url);
  });

  app.get("/api/oauth/callback/google", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");

    if (!code) {
      res.status(400).json({ error: "code is required" });
      return;
    }

    try {
      let origin = "";
      if (state) {
        try {
          const decoded = JSON.parse(
            Buffer.from(state, "base64").toString("utf-8")
          );
          origin = decoded.origin || "";
        } catch {
          origin = "";
        }
      }

      if (!origin) {
        origin = `${req.protocol}://${req.get("host")}`;
      }

      const redirectUri = `${origin}/api/oauth/callback/google`;
      const client = getGoogleClient(redirectUri);
      const { tokens } = await client.getToken(code);
      client.setCredentials(tokens);

      if (!tokens.id_token) {
        res.status(400).json({ error: "Missing Google id_token" });
        return;
      }

      const ticket = await client.verifyIdToken({
        idToken: tokens.id_token,
        audience: ENV.googleClientId,
      });
      const payload = ticket.getPayload();

      if (!payload || !payload.sub) {
        res.status(400).json({ error: "Invalid Google token payload" });
        return;
      }

      const openId = `google_${payload.sub}`;
      const name = payload.name || payload.email || "User";
      const email = payload.email || null;

      await db.upsertUser({
        openId,
        name,
        email,
        loginMethod: "google",
        lastSignedIn: new Date(),
      });

      const sessionToken = await sdk.createSessionToken(openId, {
        name,
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, {
        ...cookieOptions,
        maxAge: ONE_YEAR_MS,
      });
      res.redirect(302, "/");
    } catch (error) {
      console.error("[OAuth] Google callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}

export function registerOAuthRoutes(app: Express) {
  app.get("/api/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", ts: Date.now() });
  });

  if (ENV.googleClientId && ENV.googleClientSecret) {
    registerGoogleOAuthRoutes(app);
    return;
  }

  registerManusOAuthRoutes(app);
}
