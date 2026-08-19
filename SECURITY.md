# Security

AI Council is an orchestration and decision-support plugin. Council outputs are model-generated advice, not authoritative security, legal, financial, or compliance determinations.

The plugin stores role definitions, templates, deliberation transcripts, model route names, and proposals in its local state file. Do not submit secrets to a council unless every selected provider is authorized to receive them.

Provider credentials remain in DSH adapters and are not stored by this plugin. HTTP configuration routes enforce same-origin checks and are intended for the local DSH Web UI.
