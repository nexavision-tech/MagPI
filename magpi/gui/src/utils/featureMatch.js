export const featuresMatch = (f1, f2) => {
    if (!f1 || !f2) return false;
    if (f1 === f2) return true;
    
    // Fast path stringify
    if (JSON.stringify(f1) === JSON.stringify(f2)) return true;
    
    // Check common ID keys
    const idKeys = ['OBJECTID', 'FID', 'id', 'ID', 'uuid'];
    for (const key of idKeys) {
        if (f1[key] !== undefined && f2[key] !== undefined && f1[key] === f2[key]) {
            return true;
        }
    }
    
    // Fallback heuristic: check if at least 3 keys match perfectly (or all keys if less than 3)
    const keys1 = Object.keys(f1);
    const keys2 = Object.keys(f2);
    if (keys1.length === 0 || keys2.length === 0) return false;
    
    let matchCount = 0;
    for (const key of keys1) {
        if (f1[key] !== undefined && f1[key] === f2[key]) {
            matchCount++;
        }
    }
    
    const requiredMatches = Math.min(3, keys1.length);
    return matchCount >= requiredMatches;
};
