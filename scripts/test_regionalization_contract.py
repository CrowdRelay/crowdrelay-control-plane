#!/usr/bin/env python3
from pathlib import Path
R=Path(__file__).resolve().parents[1]
model=(R/"crates/control-plane-api/src/model.rs").read_text(); store=(R/"crates/control-plane-api/src/store.rs").read_text(); routes=(R/"crates/control-plane-api/src/routes.rs").read_text(); prov=(R/"deploy/provisioner.py").read_text(); ui=(R/"frontend/src/pages/TenantsPage.tsx").read_text(); mig=(R/"migrations/0005_tenant_regional_profile.sql").read_text()
checks={"model":"pub struct RegionalProfile" in model,"schema4":'"schema": 4' in store,"immutable":"dataRegion cannot be changed by ordinary tenant editing" in store,"claim":"regionalProfile,dataRegion" in store,"pool":"CONTROL_PLANE_PROVISIONER_DATA_REGION" in prov,"legacy-config":'getattr(config, "data_region", None)' in prov,"schema4-enforced":"agent_region != planned_region" in prov,"tz":"CROWDRELAY_TENANT_TIMEZONE" in prov,"currency":"CROWDRELAY_TENANT_CURRENCY" in prov,"residency":"CROWDRELAY_TENANT_DATA_REGION" in prov,"us-explicit":"timezone:''" in ui,"no-pl-fallback":'unwrap_or("PL")' not in store,"no-backfill":"UPDATE control_plane_tenants" not in mig,"endpoint":"/regional-profile" in routes}
bad=[k for k,v in checks.items() if not v]
if bad: raise SystemExit("REGIONALIZATION_CONTRACT=FAIL "+','.join(bad))
print("REGIONALIZATION_CONTRACT=PASS schema=4 residency=explicit legacy=unclassified")
