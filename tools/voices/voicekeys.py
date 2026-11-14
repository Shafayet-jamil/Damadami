"""Shared cache naming for the voice pipeline (no heavy imports)."""
import hashlib


def key_for(gender, text):
    """File name of a phrase recorded once per gender in CACHE/base/<gender>/."""
    return hashlib.sha1((gender + '|' + text).encode('utf-8')).hexdigest()[:16]
