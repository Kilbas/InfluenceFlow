import { render } from "@react-email/render";
import {
  Body,
  Html,
  Img,
  Section,
  Text,
} from "@react-email/components";

export interface RenderHtmlParams {
  bodyText: string;
  trackingPixelId: string | null;
  // Optional override for the public app base URL used in the pixel src.
  // Defaults to APP_URL or NEXTAUTH_URL env var.
  baseUrl?: string;
}

export interface RenderResult {
  html: string;
  text: string;
}

function buildPixelUrl(trackingPixelId: string, baseUrl?: string): string {
  const base = baseUrl ?? process.env.APP_URL ?? process.env.NEXTAUTH_URL;
  if (!base)
    throw new Error(
      "Tracking pixel requires baseUrl arg or APP_URL/NEXTAUTH_URL env"
    );
  return `${base.replace(/\/$/, "")}/api/track/open/${trackingPixelId}.gif`;
}

function EmailTemplate({
  bodyText,
  pixelUrl,
}: {
  bodyText: string;
  pixelUrl: string | null;
}) {
  return (
    <Html lang="en">
      <Body
        style={{
          fontFamily: "Arial, sans-serif",
          fontSize: "14px",
          lineHeight: "1.6",
          color: "#000000",
          backgroundColor: "#ffffff",
        }}
      >
        <Section>
          <Text style={{ whiteSpace: "pre-wrap", margin: "0 0 16px" }}>
            {bodyText}
          </Text>
          {pixelUrl && (
            <Img
              src={pixelUrl}
              width="1"
              height="1"
              alt=""
              style={{ display: "block", width: "1px", height: "1px" }}
            />
          )}
        </Section>
      </Body>
    </Html>
  );
}

export async function renderHtml(params: RenderHtmlParams): Promise<RenderResult> {
  const pixelUrl = params.trackingPixelId
    ? buildPixelUrl(params.trackingPixelId, params.baseUrl)
    : null;

  const html = await render(
    <EmailTemplate bodyText={params.bodyText} pixelUrl={pixelUrl} />
  );

  return { html, text: params.bodyText };
}
