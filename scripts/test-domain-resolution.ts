import "../src/core/config/load-env";
import { resolveTenantByHost } from "@/core/tenancy/host";

async function main() {
  // Test platform subdomain resolution
  const platformSubdomain = await resolveTenantByHost("gm-ssnow.bosc.dpdns.org");
  console.log("Platform subdomain (gm-ssnow.bosc.dpdns.org):", platformSubdomain ? "RESOLVED" : "NOT FOUND", platformSubdomain?.slug);

  // Test custom domain resolution
  const customDomain = await resolveTenantByHost("shop.gmsnow.com");
  console.log("Custom domain (shop.gmsnow.com):", customDomain ? "RESOLVED" : "NOT FOUND", customDomain?.slug);

  // Test www custom domain
  const wwwCustomDomain = await resolveTenantByHost("www.shop.gmsnow.com");
  console.log("WWW Custom domain (www.shop.gmsnow.com):", wwwCustomDomain ? "RESOLVED" : "NOT FOUND", wwwCustomDomain?.slug);
  
  // Test unknown domain
  const unknown = await resolveTenantByHost("unknown.example.com");
  console.log("Unknown domain (unknown.example.com):", unknown ? "RESOLVED" : "NOT FOUND");
}

main().catch(console.error);