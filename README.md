# gulp-rev-stable
基于gulp-rev的功能添加

## Install

```
npm install --save-dev gulp-rev-stable
```

## Usage

```
var gulp = require('gulp');
var rev = require('gulp-rev-stable');

//原来用法可以不变
gulp.task('default', function () {
    return gulp.src('src/*.css')
        .pipe(rev())
        .pipe(gulp.dest('dist'));
});

//保持版本不变化时
gulp.task('default', function () {
    return gulp.src('src/*.css')
        .pipe(rev({stable:true,pth:'dist/rev-manifest.json'}))
        .pipe(gulp.dest('dist'));
});

//执行后,会多一个rev-manifest-changeList.json来记录哪些文件是被修改而版本没改变
//新增的文件按照原来的方式打版本处理

```

这个修改是为了适应自己的web构建工具,其它开发者用不到请继续支持gulp-rev