import Recipe from '../models/Recipe.js';
import { createAudit } from '../services/audit.service.js';

const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const normalizeIds = (ids = []) =>
  Array.from(new Set(ids.map((id) => String(id || '').trim()).filter(Boolean)));

const buildQueueFilter = (query = {}) => {
  const filter = {};

  if (query.visibility === 'hidden') {
    filter.isHidden = true;
  } else if (query.visibility === 'visible') {
    filter.isHidden = { $ne: true };
  }

  if (query.status) {
    filter.status = String(query.status).trim();
  }

  if (query.flag === 'pinned') {
    filter.isPinned = true;
  }

  if (query.flag === 'featured') {
    filter.isFeatured = true;
  }

  if (query.flag === 'reported') {
    filter.$or = [
      { isReported: true },
      { reportCount: { $gt: 0 } },
    ];
  }

  if (query.q && String(query.q).trim()) {
    const regex = new RegExp(String(query.q).trim(), 'i');
    filter.$or = [
      ...(filter.$or || []),
      { name: regex },
      { description: regex },
      { category: regex },
      { hiddenReason: regex },
      { pinnedReason: regex },
      { featuredReason: regex },
    ];
  }

  return filter;
};

const buildAuditDetails = ({ reason, extra = {} }) => ({
  reason: reason || '',
  ...extra,
});

const getActorId = (req) => req.user?._id || req.user?.id || null;

const applyRecipeModeration = async (req, res, recipeId, update, auditAction, details = {}) => {
  try {
    const recipe = await Recipe.findByIdAndUpdate(recipeId, update, {
      new: true,
      runValidators: true,
    }).populate('author', 'fullName email avatarUrl');

    if (!recipe) {
      return res.status(404).json({ message: 'Recipe not found' });
    }

    await createAudit(req, {
      action: auditAction,
      resourceType: 'Recipe',
      resourceId: recipe._id,
      details: buildAuditDetails({ reason: details.reason, extra: details }),
    });

    return res.json(recipe);
  } catch (error) {
    console.error(`${auditAction} error:`, error);
    return res.status(500).json({ message: 'Failed to update moderation state' });
  }
};

export const getModerationQueue = async (req, res) => {
  try {
    const page = parsePositiveInt(req.query.page, 1);
    const limit = Math.min(100, parsePositiveInt(req.query.limit, 20));
    const skip = (page - 1) * limit;
    const filter = buildQueueFilter(req.query);

    const [total, items, hiddenCount, pinnedCount, featuredCount] = await Promise.all([
      Recipe.countDocuments(filter),
      Recipe.find(filter)
        .sort({ updatedAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('author', 'fullName email avatarUrl'),
      Recipe.countDocuments({ ...filter, isHidden: true }),
      Recipe.countDocuments({ ...filter, isPinned: true }),
      Recipe.countDocuments({ ...filter, isFeatured: true }),
    ]);

    return res.json({
      total,
      page,
      limit,
      items,
      counts: {
        hidden: hiddenCount || 0,
        pinned: pinnedCount || 0,
        featured: featuredCount || 0,
      },
    });
  } catch (error) {
    console.error('getModerationQueue error:', error);
    return res.status(500).json({ message: 'Failed to fetch moderation queue' });
  }
};

export const hideRecipe = async (req, res) => {
  const { reason = 'Ẩn bởi admin' } = req.body || {};
  return applyRecipeModeration(
    req,
    res,
    req.params.id,
    {
      $set: {
        isHidden: true,
        hiddenReason: String(reason || '').trim() || 'Ẩn bởi admin',
        hiddenAt: new Date(),
        moderatedBy: getActorId(req),
      },
    },
    'hide_recipe',
    { reason, hidden: true },
  );
};

export const restoreRecipe = async (req, res) => {
  const { reason = 'Khôi phục bởi admin' } = req.body || {};
  return applyRecipeModeration(
    req,
    res,
    req.params.id,
    {
      $set: {
        isHidden: false,
        hiddenReason: '',
        hiddenAt: null,
        moderatedBy: getActorId(req),
      },
    },
    'restore_recipe',
    { reason, hidden: false },
  );
};

export const togglePinnedRecipe = async (req, res) => {
  const { value, reason = '' } = req.body || {};
  try {
    const recipe = await Recipe.findById(req.params.id);
    if (!recipe) {
      return res.status(404).json({ message: 'Recipe not found' });
    }

    const shouldPin = typeof value === 'boolean' ? value : !recipe.isPinned;
    recipe.isPinned = shouldPin;
    recipe.pinnedReason = shouldPin ? String(reason || '').trim() : '';
    recipe.pinnedAt = shouldPin ? new Date() : null;
    recipe.moderatedBy = getActorId(req);

    await recipe.save();

    await createAudit(req, {
      action: shouldPin ? 'pin_recipe' : 'unpin_recipe',
      resourceType: 'Recipe',
      resourceId: recipe._id,
      details: buildAuditDetails({ reason, extra: { pinned: shouldPin } }),
    });

    return res.json(recipe);
  } catch (error) {
    console.error('togglePinnedRecipe error:', error);
    return res.status(500).json({ message: 'Failed to update pin state' });
  }
};

export const toggleFeaturedRecipe = async (req, res) => {
  const { value, reason = '' } = req.body || {};
  try {
    const recipe = await Recipe.findById(req.params.id);
    if (!recipe) {
      return res.status(404).json({ message: 'Recipe not found' });
    }

    const shouldFeature = typeof value === 'boolean' ? value : !recipe.isFeatured;
    recipe.isFeatured = shouldFeature;
    recipe.featuredReason = shouldFeature ? String(reason || '').trim() : '';
    recipe.featuredAt = shouldFeature ? new Date() : null;
    recipe.moderatedBy = getActorId(req);

    await recipe.save();

    await createAudit(req, {
      action: shouldFeature ? 'feature_recipe' : 'unfeature_recipe',
      resourceType: 'Recipe',
      resourceId: recipe._id,
      details: buildAuditDetails({ reason, extra: { featured: shouldFeature } }),
    });

    return res.json(recipe);
  } catch (error) {
    console.error('toggleFeaturedRecipe error:', error);
    return res.status(500).json({ message: 'Failed to update feature state' });
  }
};

export const bulkModerateRecipes = async (req, res) => {
  try {
    const { ids = [], action, reason = '', value } = req.body || {};
    const recipeIds = normalizeIds(ids);

    if (!recipeIds.length) {
      return res.status(400).json({ message: 'No recipe ids provided' });
    }

    const update = {
      moderatedBy: getActorId(req),
    };

    const auditActionMap = {
      hide: 'bulk_hide_recipes',
      restore: 'bulk_restore_recipes',
      pin: 'bulk_pin_recipes',
      feature: 'bulk_feature_recipes',
    };

    switch (action) {
      case 'hide':
        update.isHidden = true;
        update.hiddenReason = String(reason || '').trim() || 'Ẩn hàng loạt';
        update.hiddenAt = new Date();
        break;
      case 'restore':
        update.isHidden = false;
        update.hiddenReason = '';
        update.hiddenAt = null;
        break;
      case 'pin':
        update.isPinned = typeof value === 'boolean' ? value : true;
        update.pinnedReason = update.isPinned ? String(reason || '').trim() : '';
        update.pinnedAt = update.isPinned ? new Date() : null;
        break;
      case 'feature':
        update.isFeatured = typeof value === 'boolean' ? value : true;
        update.featuredReason = update.isFeatured ? String(reason || '').trim() : '';
        update.featuredAt = update.isFeatured ? new Date() : null;
        break;
      default:
        return res.status(400).json({ message: 'Unsupported moderation action' });
    }

    const result = await Recipe.updateMany(
      { _id: { $in: recipeIds } },
      { $set: update },
    );

    const matched = result.modifiedCount ?? result.nModified ?? 0;

    await createAudit(req, {
      action: auditActionMap[action],
      resourceType: 'Recipe',
      resourceId: null,
      details: buildAuditDetails({ reason, extra: { ids: recipeIds, matched, action, value } }),
    });

    return res.json({
      message: 'Bulk moderation completed',
      matched,
      ids: recipeIds,
    });
  } catch (error) {
    console.error('bulkModerateRecipes error:', error);
    return res.status(500).json({ message: 'Failed to perform bulk moderation' });
  }
};

export default {
  getModerationQueue,
  hideRecipe,
  restoreRecipe,
  togglePinnedRecipe,
  toggleFeaturedRecipe,
  bulkModerateRecipes,
};