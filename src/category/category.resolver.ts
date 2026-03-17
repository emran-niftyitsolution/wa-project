import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CategoryService } from './category.service';
import {
  CategoryWithParentResponse,
  CreateCategoryInput,
  DeactivateCategoryInput,
  GetCategoryInput,
  PaginateCategoryInput,
  PaginatedCategory,
  UpdateCategoryInput,
} from './dtos/category.input';
import { Category } from './schema/category.schema';

@Resolver(() => Category)
export class CategoryResolver {
  constructor(private readonly categoryService: CategoryService) {}

  @Mutation(() => Category, {
    description: 'Create a category (name must be unique)',
  })
  createCategory(@Args('input') input: CreateCategoryInput): Promise<Category> {
    return this.categoryService.create(input);
  }

  @Query(() => Category, {
    nullable: true,
    description: 'Get a category by ID',
  })
  getCategory(@Args('input') input: GetCategoryInput): Promise<Category> {
    return this.categoryService.getCategory(input._id);
  }

  @Query(() => PaginatedCategory, {
    description: 'List categories with optional filters and pagination',
  })
  paginateCategories(
    @Args('input', { nullable: true }) input?: PaginateCategoryInput,
  ): Promise<PaginatedCategory> {
    return this.categoryService.paginate(input ?? {});
  }

  @Query(() => [CategoryWithParentResponse], {
    name: 'searchCategories',
    description:
      'Search categories by name; each result includes parent category in the same response',
  })
  searchCategories(
    @Args('search', { type: () => String }) search: string,
  ): Promise<CategoryWithParentResponse[]> {
    return this.categoryService.searchCategories(search) as Promise<
      CategoryWithParentResponse[]
    >;
  }

  @Mutation(() => Category, {
    description:
      'Deactivate a category and all its descendants (unlimited nesting)',
  })
  deactivateCategory(
    @Args('input') input: DeactivateCategoryInput,
  ): Promise<Category> {
    return this.categoryService.deactivate(input._id);
  }

  @Mutation(() => Category, { description: 'Update a category' })
  updateCategory(@Args('input') input: UpdateCategoryInput): Promise<Category> {
    const { _id, ...rest } = input;
    return this.categoryService.update(_id, rest);
  }

  @Mutation(() => Boolean, {
    description: 'Delete a category (fails if it has children)',
  })
  deleteCategory(@Args('input') input: GetCategoryInput): Promise<boolean> {
    return this.categoryService.delete(input._id);
  }
}
