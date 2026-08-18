---
"@fluidframework/container-runtime": minor
"@fluidframework/runtime-definitions": minor
"@fluidframework/runtime-utils": minor
"@fluidframework/datastore-definitions": minor
"@fluidframework/datastore": minor
"@fluidframework/shared-object-base": minor
"@fluidframework/ordered-collection": minor
"@fluidframework/register-collection": minor
"__section": feature
---

Add builder-based summary and garbage collection APIs with centralized successful-summary state

The new `ISummaryBuilder`, `IGCDataBuilder` and `ISummarizable` APIs let the container runtime, data stores, and DDSes write summary content and garbage collection data into a shared tree, using a single reference sequence number to decide when unchanged subtrees can be reused. The existing summary and GC APIs are unchanged, and a summary or GC graph is produced entirely by one flow or the other. The flows that use these APIs are off by default behind the `Fluid.ContainerRuntime.EnableSummarizeV2` feature gate.
