import {
  Field,
  ID,
  InputType,
  ObjectType,
  OmitType,
  PartialType,
} from '@nestjs/graphql';
import {
  IsBoolean,
  IsMongoId,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Types } from 'mongoose';
import { PaginatedType } from '../../common/objecttypes/pagination';
import { Category } from '../schema/category.schema';

@InputType()
export class GetCategoryInput {
  @Field(() => ID)
  @IsMongoId()
  _id: Types.ObjectId;
}

@InputType()
export class PaginateCategoryInput {
  @Field(() => ID, {
    nullable: true,
    description: 'Filter by parent ID; omit for root categories',
  })
  @IsOptional()
  @IsMongoId()
  parentId?: Types.ObjectId;

  @Field({ nullable: true, description: 'Filter by active state' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @Field({ nullable: true, description: 'Search by name (case-insensitive)' })
  @IsOptional()
  @IsString()
  search?: string;

  @Min(1)
  @IsOptional()
  @Field(() => Number, { nullable: true })
  page?: number;

  @Max(100)
  @Min(1)
  @IsOptional()
  @Field(() => Number, { nullable: true })
  limit?: number;
}

@InputType()
export class CreateCategoryInput extends OmitType(Category, [
  '_id',
  'createdAt',
  'updatedAt',
]) {
  @Field(() => ID, {
    nullable: true,
    description: 'Parent category ID; omit for root',
  })
  @IsOptional()
  @IsMongoId()
  parent?: Types.ObjectId | null;
}

@InputType()
export class UpdateCategoryInput extends PartialType(
  OmitType(Category, ['_id', 'createdAt', 'updatedAt']),
) {
  @IsMongoId()
  @Field(() => ID)
  _id: Types.ObjectId;
}

@InputType()
export class DeactivateCategoryInput {
  @Field(() => ID)
  @IsMongoId()
  _id: Types.ObjectId;
}

@ObjectType()
export class PaginatedCategory extends PaginatedType(Category) {}

/** Category with parent included in the same response (e.g. for search). */
@ObjectType()
export class CategoryWithParentResponse {
  @Field(() => ID)
  _id: Types.ObjectId;

  @Field()
  name: string;

  @Field(() => ID, { nullable: true })
  parent?: Types.ObjectId | null;

  @Field(() => Category, {
    nullable: true,
    description: 'Parent category when present',
  })
  parentCategory: Category | null;

  @Field()
  isActive: boolean;

  @Field({ nullable: true })
  createdAt?: Date;

  @Field({ nullable: true })
  updatedAt?: Date;
}
