import { Field, ID, InputType, ObjectType } from '@nestjs/graphql';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import {
  IsBoolean,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export type CategoryDocument = HydratedDocument<Category>;

@InputType('CategoryInput')
@ObjectType()
@Schema({ timestamps: true })
export class Category {
  @IsMongoId()
  @IsString()
  @IsNotEmpty()
  @Field(() => ID)
  _id: Types.ObjectId;

  @MinLength(2)
  @MaxLength(100)
  @IsString()
  @IsNotEmpty()
  @Prop({ required: true, unique: true, trim: true })
  name: string;

  @IsOptional()
  @Field(() => ID, {
    nullable: true,
    description: 'Parent category ID; null for root',
  })
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Category', default: null })
  parent?: Types.ObjectId | null;

  @IsBoolean()
  @IsOptional()
  @Prop({ default: true })
  isActive?: boolean;

  @Field(() => Date, { nullable: true })
  @IsOptional()
  createdAt?: Date;

  @Field(() => Date, { nullable: true })
  @IsOptional()
  updatedAt?: Date;
}

export const CategorySchema = SchemaFactory.createForClass(Category);

// Index for efficient parent lookups and tree traversal
CategorySchema.index({ parent: 1 });
CategorySchema.index({ isActive: 1, name: 1 });
