# Mononoke

Standalone, offline support tool for DAST. It turns the methodology docs into a living test plan that adapts to the target: the stack recon drives relevance, and each functionality gets a filtered checklist with progress and notes.

## Usage

In the left sidebar, the top is the methodology to read (recon, stack recon, file discovery, and the full vulnerability reference). 

The bottom left is the interactive part (Assessment) : add the target's pages, then their functionalities. Each functionality shows the vulnerability tree filtered to what is relevant for the target, where you set applicability and status, tick techniques, and take notes.

Use Save and Open to keep a session as a `.json` file.

## Use of AI

The front end was fully vibe-coded with Claude Opus 4.8.

The content is an AI reorganization/formating of notes taken by hand while working through the PortSwigger Web Security Academy labs. Huge thanks to PortSwigger for their incredible content.
