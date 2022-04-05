/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/*
 * THIS IS AN AUTOGENERATED FILE. DO NOT EDIT THIS FILE DIRECTLY.
 * Generated by fluid-type-validator in @fluidframework/build-tools.
 */
/* eslint-disable max-lines */
import * as old from "@fluidframework/view-adapters-previous";
import * as current from "../../index";

type TypeOnly<T> = {
    [P in keyof T]: TypeOnly<T[P]>;
};

/*
* Validate forward compat by using old type in place of current type
* If breaking change required, add in package.json under typeValidation.broken.0.58.2002:
* "ClassDeclaration_HTMLViewAdapter": {"forwardCompat": false}
*/
declare function get_old_ClassDeclaration_HTMLViewAdapter():
    TypeOnly<old.HTMLViewAdapter>;
declare function use_current_ClassDeclaration_HTMLViewAdapter(
    use: TypeOnly<current.HTMLViewAdapter>);
use_current_ClassDeclaration_HTMLViewAdapter(
    get_old_ClassDeclaration_HTMLViewAdapter());

/*
* Validate back compat by using current type in place of old type
* If breaking change required, add in package.json under typeValidation.broken.0.58.2002:
* "ClassDeclaration_HTMLViewAdapter": {"backCompat": false}
*/
declare function get_current_ClassDeclaration_HTMLViewAdapter():
    TypeOnly<current.HTMLViewAdapter>;
declare function use_old_ClassDeclaration_HTMLViewAdapter(
    use: TypeOnly<old.HTMLViewAdapter>);
use_old_ClassDeclaration_HTMLViewAdapter(
    get_current_ClassDeclaration_HTMLViewAdapter());

/*
* Validate forward compat by using old type in place of current type
* If breaking change required, add in package.json under typeValidation.broken.0.58.2002:
* "InterfaceDeclaration_IReactViewAdapterProps": {"forwardCompat": false}
*/
declare function get_old_InterfaceDeclaration_IReactViewAdapterProps():
    TypeOnly<old.IReactViewAdapterProps>;
declare function use_current_InterfaceDeclaration_IReactViewAdapterProps(
    use: TypeOnly<current.IReactViewAdapterProps>);
use_current_InterfaceDeclaration_IReactViewAdapterProps(
    get_old_InterfaceDeclaration_IReactViewAdapterProps());

/*
* Validate back compat by using current type in place of old type
* If breaking change required, add in package.json under typeValidation.broken.0.58.2002:
* "InterfaceDeclaration_IReactViewAdapterProps": {"backCompat": false}
*/
declare function get_current_InterfaceDeclaration_IReactViewAdapterProps():
    TypeOnly<current.IReactViewAdapterProps>;
declare function use_old_InterfaceDeclaration_IReactViewAdapterProps(
    use: TypeOnly<old.IReactViewAdapterProps>);
use_old_InterfaceDeclaration_IReactViewAdapterProps(
    get_current_InterfaceDeclaration_IReactViewAdapterProps());

/*
* Validate forward compat by using old type in place of current type
* If breaking change required, add in package.json under typeValidation.broken.0.58.2002:
* "ClassDeclaration_MountableView": {"forwardCompat": false}
*/
declare function get_old_ClassDeclaration_MountableView():
    TypeOnly<old.MountableView>;
declare function use_current_ClassDeclaration_MountableView(
    use: TypeOnly<current.MountableView>);
use_current_ClassDeclaration_MountableView(
    get_old_ClassDeclaration_MountableView());

/*
* Validate back compat by using current type in place of old type
* If breaking change required, add in package.json under typeValidation.broken.0.58.2002:
* "ClassDeclaration_MountableView": {"backCompat": false}
*/
declare function get_current_ClassDeclaration_MountableView():
    TypeOnly<current.MountableView>;
declare function use_old_ClassDeclaration_MountableView(
    use: TypeOnly<old.MountableView>);
use_old_ClassDeclaration_MountableView(
    get_current_ClassDeclaration_MountableView());

/*
* Validate forward compat by using old type in place of current type
* If breaking change required, add in package.json under typeValidation.broken.0.58.2002:
* "ClassDeclaration_ReactViewAdapter": {"forwardCompat": false}
*/
declare function get_old_ClassDeclaration_ReactViewAdapter():
    TypeOnly<old.ReactViewAdapter>;
declare function use_current_ClassDeclaration_ReactViewAdapter(
    use: TypeOnly<current.ReactViewAdapter>);
use_current_ClassDeclaration_ReactViewAdapter(
    get_old_ClassDeclaration_ReactViewAdapter());

/*
* Validate back compat by using current type in place of old type
* If breaking change required, add in package.json under typeValidation.broken.0.58.2002:
* "ClassDeclaration_ReactViewAdapter": {"backCompat": false}
*/
declare function get_current_ClassDeclaration_ReactViewAdapter():
    TypeOnly<current.ReactViewAdapter>;
declare function use_old_ClassDeclaration_ReactViewAdapter(
    use: TypeOnly<old.ReactViewAdapter>);
use_old_ClassDeclaration_ReactViewAdapter(
    get_current_ClassDeclaration_ReactViewAdapter());
