# 🐞 Scientific Debugging (Bug-Fix) Recipe

This recipe defines how to autonomously detect and permanently resolve a bug.

## 1. Reproduction
- Analyze the logs (`audit_log.md`) that reported the error.
- Write the smallest test case (failing test) that triggers the error.

## 2. Root Cause Analysis
- Check system resources with `get_system_health`.
- Verify the status of services with `check_active_ports`.
- Examine relevant code blocks line by line using `read_file`.

## 3. Surgical Fix
- Perform only the surgical intervention that will fix the error.
- Check if there is a missing variable in ".env".

## 4. Permanent Solution
- Verify that the test you wrote passes.
- If `quality-standards.md` needs to be updated to prevent similar errors, submit a proposal.
