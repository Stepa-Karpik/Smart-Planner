#!/bin/sh
set -e

exec hypercorn app.main:app --bind 0.0.0.0:8000
