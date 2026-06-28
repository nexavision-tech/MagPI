/**
 * EditSession — Per-cell edit tracking (inspired by ArcGIS Services pattern)
 * 
 * Tracks modifications, new features, and deletions within a single fishnet cell.
 * Supports dirty detection, changeset extraction, and full revert.
 * 
 * Usage:
 *   const session = new EditSession(nodeId, bbox, originalFeatures);
 *   session.trackEdit(featureIdx, newGeometry);
 *   session.trackNew(newFeature);
 *   if (session.isDirty()) { /* warn user */ }
 *   const changeset = session.getChangeset(); // only modified features
 *   session.revert(); // returns original features
 */
export class EditSession {
    constructor(nodeId, bbox, originalFeatures) {
        this.nodeId = nodeId;
        this.bbox = bbox;
        this.startTime = Date.now();
        this.isActive = true;

        // Deep clone original features for revert capability
        this._originalFeatures = JSON.parse(JSON.stringify(originalFeatures));

        // Track changes by feature index in the original array
        this._modifiedGeometries = new Map(); // featureIdx → new geometry
        this._modifiedProperties = new Map(); // featureIdx → modified properties
        this._newFeatures = [];               // Features added during editing
        this._deletedIndices = new Set();      // Indices of deleted features

        // Undo/redo support
        this._undoStack = [];
        this._redoStack = [];
    }

    /**
     * Track a geometry edit on an existing feature
     */
    trackEdit(featureIdx, newGeometry, oldGeometry) {
        const prevGeometry = this._modifiedGeometries.get(featureIdx) || oldGeometry;
        this._modifiedGeometries.set(featureIdx, newGeometry);

        this._undoStack.push({
            type: 'edit',
            featureIdx,
            oldGeometry: prevGeometry,
            newGeometry
        });
        this._redoStack = []; // Clear forward history
    }

    /**
     * Track a new feature added during editing
     */
    trackNew(feature) {
        const idx = this._newFeatures.length;
        this._newFeatures.push(feature);

        this._undoStack.push({
            type: 'new',
            newFeatureIdx: idx,
            feature
        });
        this._redoStack = [];
    }

    /**
     * Track a feature deletion
     */
    trackDelete(featureIdx) {
        this._deletedIndices.add(featureIdx);

        this._undoStack.push({
            type: 'delete',
            featureIdx
        });
        this._redoStack = [];
    }

    /**
     * Undo the last operation
     */
    undo() {
        if (this._undoStack.length === 0) return null;
        const op = this._undoStack.pop();
        this._redoStack.push(op);

        switch (op.type) {
            case 'edit':
                if (op.oldGeometry) {
                    this._modifiedGeometries.set(op.featureIdx, op.oldGeometry);
                } else {
                    this._modifiedGeometries.delete(op.featureIdx);
                }
                break;
            case 'new':
                this._newFeatures.splice(op.newFeatureIdx, 1);
                break;
            case 'delete':
                this._deletedIndices.delete(op.featureIdx);
                break;
        }
        return op;
    }

    /**
     * Redo the last undone operation
     */
    redo() {
        if (this._redoStack.length === 0) return null;
        const op = this._redoStack.pop();
        this._undoStack.push(op);

        switch (op.type) {
            case 'edit':
                this._modifiedGeometries.set(op.featureIdx, op.newGeometry);
                break;
            case 'new':
                this._newFeatures.splice(op.newFeatureIdx, 0, op.feature);
                break;
            case 'delete':
                this._deletedIndices.add(op.featureIdx);
                break;
        }
        return op;
    }

    canUndo() { return this._undoStack.length > 0; }
    canRedo() { return this._redoStack.length > 0; }

    /**
     * Check if any edits have been made
     */
    isDirty() {
        return this._modifiedGeometries.size > 0 ||
               this._newFeatures.length > 0 ||
               this._deletedIndices.size > 0;
    }

    /**
     * Get summary of changes
     */
    getSummary() {
        return {
            modified: this._modifiedGeometries.size,
            added: this._newFeatures.length,
            deleted: this._deletedIndices.size,
            total: this._modifiedGeometries.size + this._newFeatures.length + this._deletedIndices.size,
            isDirty: this.isDirty(),
            duration: Date.now() - this.startTime
        };
    }

    /**
     * Get the final feature set incorporating all edits (for saving)
     */
    getEditedFeatures() {
        const features = [];
        
        // Process original features (apply edits, skip deletions)
        this._originalFeatures.forEach((feat, idx) => {
            if (this._deletedIndices.has(idx)) return;
            
            const editedFeat = JSON.parse(JSON.stringify(feat));
            if (this._modifiedGeometries.has(idx)) {
                editedFeat.geometry = this._modifiedGeometries.get(idx);
            }
            if (this._modifiedProperties.has(idx)) {
                Object.assign(editedFeat.properties, this._modifiedProperties.get(idx));
            }
            features.push(editedFeat);
        });
        
        // Append new features
        this._newFeatures.forEach(feat => {
            const cleanFeat = JSON.parse(JSON.stringify(feat));
            if (cleanFeat.properties) {
                delete cleanFeat.properties.isNewFeature;
                delete cleanFeat.properties._magpi_new_id;
            }
            features.push(cleanFeat);
        });
        
        return features;
    }

    /**
     * Get only the original features (for revert/cancel)
     */
    revert() {
        this._modifiedGeometries.clear();
        this._modifiedProperties.clear();
        this._newFeatures = [];
        this._deletedIndices.clear();
        this._undoStack = [];
        this._redoStack = [];
        return JSON.parse(JSON.stringify(this._originalFeatures));
    }

    /**
     * Close the edit session
     */
    close() {
        this.isActive = false;
    }
}

/**
 * EditSessionManager — Manages active edit sessions across cells
 */
export class EditSessionManager {
    constructor() {
        this._sessions = new Map(); // nodeId+bbox → EditSession
    }

    startSession(nodeId, bbox, features) {
        const key = `${nodeId}::${bbox || 'global'}`;
        if (this._sessions.has(key)) {
            return this._sessions.get(key);
        }
        const session = new EditSession(nodeId, bbox, features);
        this._sessions.set(key, session);
        console.log('[MagPI] Edit session started:', key, '—', features.length, 'features');
        return session;
    }

    getSession(nodeId, bbox) {
        const key = `${nodeId}::${bbox || 'global'}`;
        return this._sessions.get(key) || null;
    }

    getActiveSession() {
        for (const session of this._sessions.values()) {
            if (session.isActive) return session;
        }
        return null;
    }

    hasUnsavedChanges() {
        for (const session of this._sessions.values()) {
            if (session.isActive && session.isDirty()) return true;
        }
        return false;
    }

    endSession(nodeId, bbox) {
        const key = `${nodeId}::${bbox || 'global'}`;
        const session = this._sessions.get(key);
        if (session) {
            session.close();
            this._sessions.delete(key);
        }
    }

    endAllSessions() {
        for (const [key, session] of this._sessions) {
            session.close();
        }
        this._sessions.clear();
    }
}
