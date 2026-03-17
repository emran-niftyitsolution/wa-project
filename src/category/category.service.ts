import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { PaginateModel, Types } from 'mongoose';
import { CacheService } from '../cache/cache.service';
import {
  CreateCategoryInput,
  PaginateCategoryInput,
  PaginatedCategory,
  UpdateCategoryInput,
} from './dtos/category.input';
import { Category, CategoryDocument } from './schema/category.schema';

const CACHE_TTL = 300;
const CACHE_KEY_PREFIX = 'category:';

@Injectable()
export class CategoryService {
  constructor(
    @InjectModel(Category.name)
    private readonly categoryModel: PaginateModel<CategoryDocument>,
    private readonly cache: CacheService,
  ) {}

  private async invalidateCategoryCache(): Promise<void> {
    if (this.cache.isEnabled()) {
      await this.cache.delByPattern(`${CACHE_KEY_PREFIX}*`);
    }
  }

  async create(input: CreateCategoryInput): Promise<Category> {
    const name = input.name;
    const existing = await this.categoryModel.findOne({ name });
    if (existing) {
      throw new ConflictException(
        `Category with name "${name}" already exists`,
      );
    }
    if (input.parent) {
      const parentExists = await this.categoryModel.findById(input.parent);
      if (!parentExists) {
        throw new NotFoundException('Parent category not found');
      }
    }
    const created = await this.categoryModel.create({
      name,
      parent: input.parent ?? null,
      isActive: input.isActive ?? true,
    });
    await this.invalidateCategoryCache();
    return created;
  }

  async findById(id: Types.ObjectId): Promise<Category | null> {
    if (this.cache.isEnabled()) {
      const cached = await this.cache.get<Record<string, unknown>>(
        `${CACHE_KEY_PREFIX}one:${String(id)}`,
      );
      if (cached) return this.toCategory(cached);
    }
    const doc = await this.categoryModel.findById(id).lean().exec();
    if (doc && this.cache.isEnabled()) {
      await this.cache.set(
        `${CACHE_KEY_PREFIX}one:${String(id)}`,
        doc,
        CACHE_TTL,
      );
    }
    return doc ? this.toCategory(doc as Record<string, unknown>) : null;
  }

  async getCategory(id: Types.ObjectId): Promise<Category> {
    const category = await this.findById(id);
    if (!category) throw new NotFoundException('Category not found');
    return category;
  }

  async paginate(
    input: PaginateCategoryInput = {},
  ): Promise<PaginatedCategory> {
    const { parentId, isActive, search, page = 1, limit = 10 } = input;
    const cacheKey = this.cache.isEnabled()
      ? `${CACHE_KEY_PREFIX}list:${JSON.stringify({ parentId: parentId?.toString(), isActive, search, page, limit })}`
      : null;
    if (cacheKey) {
      const cached = await this.cache.get<PaginatedCategory>(cacheKey);
      if (cached) return cached;
    }

    const query: Record<string, unknown> = {};
    if (parentId !== undefined) {
      query.parent = parentId ?? null;
    }
    if (isActive !== undefined) {
      query.isActive = isActive;
    }
    if (search) {
      query.name = { $regex: search, $options: 'i' };
    }

    const result = await this.categoryModel.paginate(query, {
      page,
      limit,
      sort: { name: 1 },
      lean: true,
    });

    const out: PaginatedCategory = {
      docs: (result.docs as unknown as Record<string, unknown>[]).map((d) =>
        this.toCategory(d),
      ),
      totalDocs: result.totalDocs,
      limit: result.limit,
      hasPrevPage: result.hasPrevPage,
      hasNextPage: result.hasNextPage,
      page: result.page,
      totalPages: result.totalPages,
      prevPage: result.prevPage,
      nextPage: result.nextPage,
      pagingCounter: result.pagingCounter,
    };
    if (cacheKey) {
      await this.cache.set(cacheKey, out, CACHE_TTL);
    }
    return out;
  }

  /** Search categories by name; each item includes parent in the same response. */
  async searchCategories(search: string): Promise<CategoryWithParent[]> {
    if (!search) return [];

    const cacheKey = this.cache.isEnabled()
      ? `${CACHE_KEY_PREFIX}search:${search}`
      : null;
    if (cacheKey) {
      const cached = await this.cache.get<CategoryWithParent[]>(cacheKey);
      if (cached) return cached;
    }

    const docs = await this.categoryModel
      .find({ name: { $regex: search, $options: 'i' } })
      .lean()
      .exec();

    const parentIds = [
      ...new Set(
        docs.map((d) => d.parent).filter((p): p is Types.ObjectId => p != null),
      ),
    ];
    const parentMap = new Map<string, Category>();
    if (parentIds.length > 0) {
      const parents = await this.categoryModel
        .find({ _id: { $in: parentIds } })
        .lean()
        .exec();
      for (const p of parents) {
        parentMap.set(p._id.toString(), this.toCategory(p));
      }
    }

    const result: CategoryWithParent[] = docs.map((d) => {
      const cat = this.toCategory(d as unknown as Record<string, unknown>);
      const parentId = d.parent as Types.ObjectId | undefined;
      const parentCategory = parentId
        ? (parentMap.get(parentId.toString()) ?? null)
        : null;
      return { ...cat, parentCategory };
    });

    if (cacheKey) {
      await this.cache.set(cacheKey, result, CACHE_TTL);
    }
    return result;
  }

  async update(
    id: Types.ObjectId,
    input: Omit<UpdateCategoryInput, '_id'>,
  ): Promise<Category> {
    const category = await this.categoryModel.findById(id);
    if (!category) throw new NotFoundException('Category not found');
    if (input.name !== undefined) {
      const name = input.name;
      const existing = await this.categoryModel.findOne({
        name,
        _id: { $ne: id },
      });
      if (existing) {
        throw new ConflictException(
          `Category with name "${name}" already exists`,
        );
      }
      (input as Record<string, unknown>).name = name;
    }
    if (input.parent !== undefined && input.parent !== null) {
      const parentExists = await this.categoryModel.findById(input.parent);
      if (!parentExists)
        throw new NotFoundException('Parent category not found');
      const parentIdStr =
        typeof input.parent === 'string'
          ? input.parent
          : input.parent.toString();
      if (id.toString() === parentIdStr) {
        throw new ConflictException('Category cannot be its own parent');
      }
    }
    const updated = await this.categoryModel
      .findByIdAndUpdate(id, input, { new: true })
      .lean()
      .exec();
    await this.invalidateCategoryCache();
    if (!updated) throw new NotFoundException('Category not found');
    return updated;
  }

  /** Deactivate this category and all descendants (unlimited depth). */
  async deactivate(id: Types.ObjectId): Promise<Category> {
    const category = await this.categoryModel.findById(id);
    if (!category) throw new NotFoundException('Category not found');

    const descendantIds = await this.collectDescendantIds(id);
    const idsToUpdate = [id, ...descendantIds];
    await this.categoryModel.updateMany(
      { _id: { $in: idsToUpdate } },
      { $set: { isActive: false } },
    );
    await this.invalidateCategoryCache();
    const updated = await this.categoryModel.findById(id).lean().exec();
    return this.toCategory(updated!);
  }

  /** Recursively collect all descendant _ids (unlimited levels). */
  private async collectDescendantIds(
    parentId: Types.ObjectId,
  ): Promise<Types.ObjectId[]> {
    const result: Types.ObjectId[] = [];
    let currentLevel: Types.ObjectId[] = [parentId];
    while (currentLevel.length > 0) {
      const children = await this.categoryModel
        .find({ parent: { $in: currentLevel } })
        .select('_id')
        .lean()
        .exec();
      const childIds = children.map((c) => c._id);
      result.push(...childIds);
      currentLevel = childIds;
    }
    return result;
  }

  async delete(id: Types.ObjectId): Promise<boolean> {
    const category = await this.categoryModel.findById(id);
    if (!category) throw new NotFoundException('Category not found');
    const hasChildren = await this.categoryModel.exists({ parent: id });
    if (hasChildren) {
      throw new ConflictException(
        'Cannot delete category with children. Deactivate instead or delete children first.',
      );
    }
    await this.categoryModel.findByIdAndDelete(id);
    await this.invalidateCategoryCache();
    return true;
  }

  /** Resolve parent category for a given category id (for GraphQL field resolver). */
  async getParent(categoryId: Types.ObjectId): Promise<Category | null> {
    const cat = await this.categoryModel
      .findById(categoryId)
      .select('parent')
      .lean()
      .exec();
    if (!cat?.parent) return null;
    return this.findById(cat.parent);
  }

  private toCategory(doc: Record<string, unknown>): Category {
    return {
      _id: doc._id as Types.ObjectId,
      name: doc.name as string,
      parent: doc.parent as Types.ObjectId | undefined,
      isActive: (doc.isActive as boolean) ?? true,
      createdAt: doc.createdAt as Date,
      updatedAt: doc.updatedAt as Date,
    };
  }
}

/** Category with parent included in the same object (for search response). */
interface CategoryWithParent extends Category {
  parentCategory: Category | null;
}
