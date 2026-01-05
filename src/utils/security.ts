/**
 * Security utilities for CleanForce
 */

/**
 * Sanitize a Salesforce API name (object or field)
 * Valid characters: letters, numbers, underscores
 * Must not start with a number
 */
export function sanitizeApiName(name: string): string | null {
    if (!name || typeof name !== 'string') {
        return null;
    }

    // Trim whitespace
    const trimmed = name.trim();
    
    // Check for empty string
    if (trimmed.length === 0) {
        return null;
    }

    // Salesforce API names: alphanumeric + underscore, can end with __c, __r, __mdt, etc.
    // Must not start with number or underscore
    const validPattern = /^[a-zA-Z][a-zA-Z0-9_]*(__[a-zA-Z]+)?$/;
    
    if (!validPattern.test(trimmed)) {
        return null;
    }

    // Prevent excessively long names (Salesforce limit is 40 chars for custom fields)
    if (trimmed.length > 80) {
        return null;
    }

    return trimmed;
}

/**
 * Sanitize a fully qualified field name (Object.Field)
 */
export function sanitizeFieldReference(fieldRef: string): string | null {
    if (!fieldRef || typeof fieldRef !== 'string') {
        return null;
    }

    const parts = fieldRef.split('.');
    
    // Must have exactly 2 parts: Object.Field
    if (parts.length !== 2) {
        return null;
    }

    const objectName = sanitizeApiName(parts[0]);
    const fieldName = sanitizeApiName(parts[1]);

    if (!objectName || !fieldName) {
        return null;
    }

    return `${objectName}.${fieldName}`;
}

/**
 * Validate that a path is within the workspace
 */
export function isPathWithinWorkspace(filePath: string, workspacePath: string): boolean {
    const path = require('path');
    const resolvedFile = path.resolve(filePath);
    const resolvedWorkspace = path.resolve(workspacePath);
    
    return resolvedFile.startsWith(resolvedWorkspace);
}

/**
 * Escape special characters for use in RegExp
 */
export function escapeRegex(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Sanitize user input for display (prevent XSS in output channels)
 */
export function sanitizeForDisplay(input: string): string {
    if (!input || typeof input !== 'string') {
        return '';
    }
    
    return input
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Validate file extension is one we expect to modify
 */
export function isValidMetadataExtension(filePath: string): boolean {
    const validExtensions = [
        '.permissionset-meta.xml',
        '.profile-meta.xml',
        '.layout-meta.xml',
        '.flexipage-meta.xml',
        '.flow-meta.xml',
        '.field-meta.xml',
        '.object-meta.xml'
    ];
    
    return validExtensions.some(ext => filePath.endsWith(ext));
}
