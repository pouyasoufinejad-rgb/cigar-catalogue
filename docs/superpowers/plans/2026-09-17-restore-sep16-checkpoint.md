# Restore Sep 16 10:28 AWST catalogue checkpoint

Target: `287f7fc5e2e612463f09a91bf59cc9ad7d8e5dc9`, whose production publisher completed successfully after the eight Sep 16 morning additions and live-copy cleanup.

Restore contract:

1. Read current live KV state without mutating it.
2. Reconstruct Production/Practical markup from the target commit's static HTML and target request audit.
3. Restore the eight additions published by the target commit from their request payloads.
4. Remove the later ACID Krush Red Cameroon addition.
5. Remove sidebar-only `brandLogos` / `hiddenBrands` section state and post-target subsection membership.
6. Preserve unrelated target-era fields and archive state.
7. PUT one complete state payload and verify read-back plus production rendering.
8. Restore repository application tree to the target checkpoint after KV recovery is verified.
