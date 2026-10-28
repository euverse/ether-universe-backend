/**
 * Atomic compare-and-set update for documents whose amounts are stored as
 * strings (so `$inc` cannot be used).
 *
 * Reads the document, lets `compute` derive the new values from it, then writes
 * them only if every field in `fields` is still exactly what was read. If a
 * concurrent writer changed any of them the write matches nothing and the whole
 * read-compute-write cycle is retried against the fresh values. This removes the
 * lost-update race of `findById` + mutate + `save()`.
 *
 * @param {Model} Model - Mongoose model
 * @param {*} id - Document _id
 * @param {string[]} fields - Amount fields `compute` reads; they guard the write
 * @param {(current: Object, raw: Object) => Object} compute - Returns the fields to set
 *   (a value of `undefined` unsets the field), or null to leave the document
 *   untouched. `current` has every guarded field defaulted to '0'. Throwing
 *   aborts the update (e.g. insufficient funds).
 * @param {Object} [options]
 * @param {ClientSession} [options.session] - Run inside this transaction
 * @param {number} [options.maxRetries] - Attempts before giving up on contention
 * @returns {Promise<Object|null>} The document as written, or null if it does not exist
 */
export async function casUpdate(Model, id, fields, compute, { session, maxRetries = 10 } = {}) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        const raw = await Model.findById(id).session(session).lean();

        if (!raw) return null;

        const current = { ...raw };
        const filter = { _id: id };

        for (const field of fields) {
            current[field] = raw[field] ?? '0';
            filter[field] = raw[field] ?? null;
        }

        const patch = compute(current, raw);

        // Nothing to write (the caller decided against changing this document)
        if (!patch) return current;

        const $set = {};
        const $unset = {};

        for (const [key, value] of Object.entries(patch)) {
            if (value === undefined) {
                $unset[key] = '';
            } else {
                $set[key] = value;
            }
        }

        const update = {};
        if (Object.keys($set).length) update.$set = $set;
        if (Object.keys($unset).length) update.$unset = $unset;

        const result = await Model.updateOne(filter, update, { session });

        if (result.matchedCount === 1) {
            return { ...current, ...patch };
        }
    }

    throw new Error(`Concurrent modification: could not update ${Model.modelName} ${id} after ${maxRetries} attempts`);
}
